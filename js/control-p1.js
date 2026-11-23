(() => {
    // Get the plant selector and parameter panels
    const plantSelect = document.getElementById("p1PlantType");
    const firstParams = document.getElementById("p1FirstParams");
    const secondParams = document.getElementById("p1SecondParams");

    // Show only the parameters of the selected plant
    function updatePlantSelection() {
        const isFirstOrder = plantSelect.value === "first";
        firstParams.classList.toggle("hidden", !isFirstOrder);
        secondParams.classList.toggle("hidden", isFirstOrder);
    }

    // Connect a slider to its displayed value
    function connectSlider(sliderId, outputId) {
        const slider = document.getElementById(sliderId);
        const output = document.getElementById(outputId);

        function updateValue() {

            const decimals = (sliderId === "p1K" || sliderId === "p1Tau") ? 2 : 1;
            output.textContent =  Number(slider.value).toFixed(decimals);

        }

        slider.addEventListener("input", updateValue);
        updateValue();
    }

    // First-order parameters
    connectSlider("p1K", "p1KValue");
    connectSlider("p1Tau", "p1TauValue");

    // Second-order parameters
    connectSlider("p1Mass", "p1MassValue");
    connectSlider("p1Damping", "p1DampingValue");
    connectSlider("p1Spring", "p1SpringValue");

    // PID controller gains
    connectSlider("p1Kp", "p1KpValue");
    connectSlider("p1Ki", "p1KiValue");
    connectSlider("p1Kd", "p1KdValue");

    // Desired setpoint
    connectSlider("p1Setpoint", "p1SetpointValue");

    // Update the visible panel when the selection changes
    plantSelect.addEventListener("change", updatePlantSelection);

    // Set the correct initial view
    updatePlantSelection();



    // Simulate a first-order plant with P or PI control
    function simulateFirstOrderPID({
        K,
        tau,
        Kp,
        Ki = 0,
        Kd = 0,
        setpoint,
        duration = 2,
        dt = 0.001,
        uMin = -20,
        uMax = 20
    }) {
        const time = [];
        const output = [];
        const control = [];
        const reference = [];

        // Initial states
        let y = 0;
        let integral = 0;

        const steps = Math.ceil(duration / dt);
        const actualDt = duration / steps;

        for (let i = 0; i <= steps; i++) {
            const t = i * actualDt;

            // 1. Calculate feedback error
            const error = setpoint - y;

            // PID control with derivative on measurement
            const requestedU = (Kp * error + Ki * integral + (Kd / tau) * y) / (1 + (K * Kd) / tau);

            // 3. Apply actuator limits
            const u = Math.max(uMin, Math.min(uMax, requestedU));

            // 4. Save values for plotting
            time.push(t);
            output.push(y);
            control.push(u);
            reference.push(setpoint);

            if (i < steps) {
                // Avoid integrating farther into saturation
                const pushingUpper = requestedU >= uMax && error > 0;
                const pushingLower = requestedU <= uMin && error < 0;

                if (Ki > 0 && !pushingUpper && !pushingLower) {
                    integral += error * actualDt;
                }

                // 5. Update the first-order plant using Euler
                const dydt = (K * u - y) / tau;
                y += actualDt * dydt;
            }
        }

        return { time, output, control, reference };
    }

    const demo = simulateFirstOrderPID({
        K: 1,
        tau: 1,
        Kp: 9,
        setpoint: 1
    });

    const lastOutput = demo.output[demo.output.length - 1];

    const errorPercent = (1 - lastOutput) * 100;

    console.log("P-only Euler simulation:", {
        initialControl: demo.control[0],
        firstEulerOutput: demo.output[1],
        finalOutput: lastOutput.toFixed(6),
        steadyStateError: errorPercent.toFixed(2) + "%"
    });


    // Calculate performance from the simulated response
    function calculateResponseMetrics(simulation, parameters) {
        const { time, output } = simulation;
        const { finalValue, setpoint, isStable } = parameters;
        const initial = output[0];
        const lastOutput = output[output.length - 1];

        const change = finalValue - initial;

        const errorPercent = 100 * Math.abs(setpoint - lastOutput) / Math.max(Math.abs(setpoint), 1e-9);

        // No measurable change in output
        if (Math.abs(change) < 1e-9) {
            return {
                riseTime: null,
                overshoot: null,
                settlingTime: null,
                steadyError: errorPercent,
                noResponse: true
            };
        }

        // Normalize the response relative to its final value
        const fraction = output.map(
            y => (y - initial) / change
        );

        // Find the first crossing of a percentage level
        function crossingTime(level) {
            for (let i = 1; i < time.length; i++) {
                const before = fraction[i - 1];
                const after = fraction[i];

                if (before < level && after >= level) {
                    const ratio = (level - before) / (after - before);
                    return time[i - 1] + ratio * (time[i] - time[i - 1]);
                }
            }

            return null;
        }

        // 10%-90% rise time
        const t10 = crossingTime(0.10);
        const t90 = crossingTime(0.90);

        const riseTime = t10 !== null && t90 !== null ? t90 - t10 : null;

        // Maximum overshoot relative to final output change
        let peakFraction = -Infinity;
        for (const value of fraction) {
            peakFraction = Math.max(peakFraction, value);
        }
        const overshoot = Math.max(0, (peakFraction - 1) * 100);

        // Last sample outside the ±2% settling band
        let lastOutside = -1;

        for (let i = 0; i < fraction.length; i++) {
            if (Math.abs(fraction[i] - 1) > 0.02) {
                lastOutside = i;
            }
        }

        const settledInWindow = isStable && lastOutside < time.length - 1;
        const settlingTime = settledInWindow ? (lastOutside < 0 ? 0 : time[lastOutside + 1]) : null;

        return {
            riseTime,
            overshoot,
            settlingTime,
            steadyError: settledInWindow ? errorPercent : null,
            noResponse: false
        };
    }


    // Second-order plant with PID control using Euler
    function simulateSecondOrderPID({
        m,
        b,
        k,
        Kp,
        Ki = 0,
        Kd = 0,
        setpoint,
        duration = 12,
        dt = 0.001,
        uMin = -20,
        uMax = 20
    }) {
        const time = [];
        const output = [];
        const control = [];
        const reference = [];

        // Plant and controller initial states
        let y = 0;
        let v = 0;
        let integral = 0;

        const steps = Math.ceil(duration / dt);
        const actualDt = duration / steps;

        for (let i = 0; i <= steps; i++) {
            const t = i * actualDt;

            // Feedback error
            const error = setpoint - y;

            // PID controller:
            // Derivative is applied to measured output
            const requestedU = Kp * error + Ki * integral - Kd * v;
            // Actuator saturation
            const u = Math.max(uMin, Math.min(uMax, requestedU));

            time.push(t);
            output.push(y);
            control.push(u);
            reference.push(setpoint);

            if (i === steps) break;

            // Conditional anti-windup
            const pushingUpper = requestedU >= uMax && error > 0;
            const pushingLower = requestedU <= uMin && error < 0;

            if (Ki > 0 && !pushingUpper && !pushingLower) {
                integral += error * actualDt;
            }

            // Second-order differential equation
            const acceleration = (u - b * v - k * y) / m;

            // Semi-implicit Euler
            v = v + actualDt * acceleration;
            y = y + actualDt * v;
        }

        return { time, output, control, reference };
    }


    // Update the P-only simulation when the user
    // changes plant parameters or controller gain.
    function updateP1Plots() {

        const graphArea = document.getElementById("p1GraphArea");
        const status = document.getElementById("p1PlotStatus");

        const isFirstOrder = plantSelect.value === "first";

        // Both systems use the same plots
        graphArea.classList.remove("hidden");

        // Read controller parameters
        const Kp = Number(document.getElementById("p1Kp").value);
        const Ki = Number(document.getElementById("p1Ki").value);
        const Kd = Number(document.getElementById("p1Kd").value);
        const setpoint = Number(document.getElementById("p1Setpoint").value);

        const uMin = -20;
        const uMax = 20;

        const controllerType =
            Ki > 0 && Kd > 0 ? "PID" :
                Ki > 0 ? "PI" :
                    Kd > 0 ? "PD" : "P-only";

        // Update block diagram with current settings
        document.getElementById("p1DiagramGains").textContent = `Kp=${Kp.toFixed(1)} Ki=${Ki.toFixed(1)} Kd=${Kd.toFixed(1)}`;

        document.getElementById("p1DiagramPlantModel").textContent = isFirstOrder ? "K / (τs + 1)" : "1 / (ms² + bs + k)";

        status.textContent = `${isFirstOrder ? "First-Order" : "Second-Order"} / ${controllerType} control.`;

        let simulation;
        let duration;
        let finalValue;
        let isStable = true;

        if (isFirstOrder) {

            // First-order plant parameters
            const K = Number(document.getElementById("p1K").value);
            const tau = Number(document.getElementById("p1Tau").value);

            const effectiveTau = tau + K * Kd;
            const a = (1 + K * Kp) / effectiveTau;
            const c = K * Ki / effectiveTau;

            let slowRate = a;
            let fastRate = a;

            if (Ki > 0) {
                const discriminant = a * a - 4 * c;

                if (discriminant >= 0) {
                    const root = Math.sqrt(discriminant);
                    slowRate = 2 * c / (a + root);
                    fastRate = (a + root) / 2;
                } else {
                    slowRate = a / 2;
                    fastRate = Math.sqrt(c);
                }
            }

            duration = Ki === 0 ? 8 / slowRate : Math.min(40, Math.max(8, 8 / slowRate));

            const dt = Math.min(0.005, 0.05 / fastRate);
            simulation = simulateFirstOrderPID({
                K, tau, Kp, Ki, Kd, setpoint,
                duration, dt, uMin, uMax
            });

            const idealFinal = Ki > 0 ? setpoint : (K * Kp * setpoint) / (1 + K * Kp);
            finalValue = Math.max(K * uMin, Math.min(K * uMax, idealFinal));

        } else {
            // Second-order plant parameters
            const m = Number(document.getElementById("p1Mass").value);
            const b = Number(document.getElementById("p1Damping").value);
            const k = Number(document.getElementById("p1Spring").value);

            const wn = Math.sqrt((k + Kp) / m);
            const decayRate = (b + Kd) / (2 * m);

            // Estimate how long the response needs to be displayed
            let slowRate;

            if (decayRate < wn) {
                slowRate = decayRate;
            } else {
                slowRate = wn * wn / (decayRate + Math.sqrt(decayRate * decayRate - wn * wn));
            }

            if (Ki > 0) {
                slowRate = Math.min(slowRate, Ki / (k + Kp));
            }

            duration = slowRate > 0 ? Math.min(60, Math.max(12, 8 / slowRate)) : 20;
            const fastestRate = Math.max(wn, (b + Kd) / m, 1);
            const dt = Math.min(0.002, 0.03 / fastestRate);
            simulation = simulateSecondOrderPID({
                m, b, k, Kp, Ki, Kd, setpoint,
                duration, dt, uMin, uMax
            });

            const idealFinal = Ki > 0 ? setpoint : (Kp * setpoint) / (k + Kp);

            finalValue = Math.max(uMin / k, Math.min(uMax / k, idealFinal));

            // Stability of the linear closed-loop model
            isStable = Ki === 0 ? (b + Kd) > 0 : (b + Kd) * (k + Kp) > m * Ki;

            if (!isStable) {
                status.textContent += " Unstable or undamped: no settling time.";
            }
        }

        // Metrics use the correct final value for either plant
        const metrics = calculateResponseMetrics(simulation, {
            finalValue,
            setpoint,
            isStable
        });


        // Display rise time
        document.getElementById("p1RiseTime").textContent =
            metrics.noResponse
                ? "No response"
                : metrics.riseTime === null
                    ? "Not reached"
                    : metrics.riseTime.toFixed(3) + " s";

        // Display overshoot
        document.getElementById("p1Overshoot").textContent = metrics.overshoot === null ? "N/A" : metrics.overshoot.toFixed(2) + "%";

        // Display settling time
        document.getElementById("p1SettlingTime").textContent =
            metrics.noResponse
                ? "No response"
                : metrics.settlingTime === null
                    ? "Not reached"
                    : metrics.settlingTime.toFixed(3) + " s";

        // Display estimated steady-state error
        document.getElementById("p1SteadyError").textContent =
            metrics.steadyError === null
                ? "Not settled"
                : metrics.steadyError.toFixed(2) + "%";


        // Display at most about 500 points per curve.
        // Euler still calculates all its internal steps.
        const stride = Math.max(1, Math.ceil(simulation.time.length / 500));

        function sample(values) {
            return values.filter(
                (_, i) =>
                    i % stride === 0 || i === values.length - 1
            );
        }

        const t = sample(simulation.time);
        const y = sample(simulation.output);
        const r = sample(simulation.reference);
        const u = sample(simulation.control);

        // Use colors from the current site theme.
        const styles = getComputedStyle(document.documentElement);
        const primary = styles.getPropertyValue("--primary").trim() || "#3158B8";
        const accent = styles.getPropertyValue("--accent").trim() || "#DA91AA";

        const textColor = getComputedStyle(document.body).color;
        const gridColor = "rgba(140,150,180,0.18)";
        const layout = {
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { color: textColor },

            margin: {
                l: 55, r: 20, t: 20, b: 55
            },

            xaxis: {
                title: { text: "Time (s)" },
                gridcolor: gridColor
            },

            yaxis: {
                gridcolor: gridColor,
                automargin: true
            },

            legend: {
                orientation: "h",
                y: 1.18
            }
        };

        const config = {
            responsive: true,
            displaylogo: false
        };

        // Plot 1: actual plant output and reference.
        Plotly.react("p1OutputPlot", [
            {
                x: t,
                y: y,
                type: "scatter",
                mode: "lines",
                name: "Actual Output",
                line: { color: primary, width: 3 }
            },
            {
                x: t,
                y: r,
                type: "scatter",
                mode: "lines",
                name: "Setpoint",
                line: {
                    color: accent,
                    width: 2,
                    dash: "dash"
                }
            }
        ], layout, config);

        // Plot 2: applied control and actuator limits.
        Plotly.react("p1ControlPlot", [
            {
                x: t,
                y: u,
                type: "scatter",
                mode: "lines",
                name: "Applied Control",
                line: { color: primary, width: 3 }
            },
            {
                x: [0, duration],
                y: [20, 20],
                type: "scatter",
                mode: "lines",
                name: "Upper Limit",
                line: {
                    color: accent,
                    dash: "dot"
                }
            },
            {
                x: [0, duration],
                y: [-20, -20],
                type: "scatter",
                mode: "lines",
                name: "Lower Limit",
                line: {
                    color: accent,
                    dash: "dot"
                }
            }
        ], layout, config);
    }

    // Recalculate when relevant values change.
    [
        "p1K",
        "p1Tau",
        "p1Mass",
        "p1Damping",
        "p1Spring",
        "p1Kp",
        "p1Ki",
        "p1Kd",
        "p1Setpoint"
    ].forEach(id => {
        document.getElementById(id).addEventListener("input", updateP1Plots);
    });

    plantSelect.addEventListener("change", updateP1Plots);

    // Redraw with the correct light/dark theme colors.
    window.addEventListener("transient-theme-change", updateP1Plots);

    // Initial plot when the page loads.
    updateP1Plots();

    const secondOrderTest = simulateSecondOrderPID({
        m: 1,
        b: 2,
        k: 4,
        Kp: 9,
        Ki: 0,
        Kd: 0,
        setpoint: 1
    });

    console.log("Second-order P test:", {
        finalOutput: secondOrderTest.output.at(-1),
        expectedFinal: 9 / 13
    });


    // P1: Predict then Check
    const predictionChoice = document.getElementById("p1PredictionChoice");
    const predictionButton = document.getElementById("p1CheckPrediction");
    const predictionResult = document.getElementById("p1PredictionResult");
    predictionButton.addEventListener("click", () => {

        const prediction = predictionChoice.value;
        // Require a prediction before revealing the answer
        if (!prediction) {
            predictionResult.textContent = "Please select your prediction first.";
            return;
        }

        // Same plant, different proportional gain
        const testSettings = {
            K: 1,
            tau: 1,
            Ki: 0,
            Kd: 0,
            setpoint: 1,
            duration: 8,
            dt: 0.001,
            uMin: -20,
            uMax: 20
        };

        // Run two independent simulations
        const before = simulateFirstOrderPID({
            ...testSettings,
            Kp: 1
        });

        const after = simulateFirstOrderPID({
            ...testSettings,
            Kp: 9
        });

        // Read the final simulated output
        const beforeFinal = before.output[before.output.length - 1];
        const afterFinal = after.output[after.output.length - 1];

        // Error relative to setpoint = 1
        const beforeError = Math.abs(1 - beforeFinal) * 100;
        const afterError = Math.abs(1 - afterFinal) * 100;
        const actualChange =
            afterError < beforeError ? "decrease" :
                afterError > beforeError ? "increase" :
                    "same";

        const isCorrect = prediction === actualChange;

        predictionResult.textContent =
            (isCorrect ? "Correct prediction! " :
                "Not quite. ") +
            `With Kp = 1, the error is ${beforeError.toFixed(2)}%. ` +
            `With Kp = 9, the error is ${afterError.toFixed(2)}%. ` +
            "Increasing Kp reduces the steady-state error " +
            "in this P-only first-order system, " +
            "but does not eliminate it completely.";
    });


    // Official Validation Check #1
    const validationButton = document.getElementById("p1RunValidation");
    const validationResults = document.getElementById("p1ValidationResults");
    function addValidationResult(title, expected, actual, passed) {
        const card = document.createElement("div");
        card.className = "lab-panel p-4";
        const heading = document.createElement("p");
        heading.className = "font-bold mb-2";
        heading.textContent = title;
        const values = document.createElement("p");
        values.className = "lab-muted text-sm";
        values.textContent = `Expected: ${expected} | Calculated: ${actual}`;
        const status = document.createElement("p");
        status.className = "font-bold mt-2";
        status.textContent = passed ? "PASS ✓" : "FAIL ✗";
        status.style.color = passed ? "#15803d" : "#dc2626";
        card.append(heading, values, status);
        validationResults.appendChild(card);
    }

    function runP1Validation() {
        validationResults.replaceChildren();

        // Official reference values
        const expectedTau = 0.1;
        const expectedError = 10;
        const expectedFinal = 0.9;

        // Run the actual Euler simulation
        const simulation = simulateFirstOrderPID({
            K: 1,
            tau: 1,
            Kp: 9,
            Ki: 0,
            Kd: 0,
            setpoint: 1,
            duration: 2,
            dt: 0.0005,
            uMin: -20,
            uMax: 20
        });

        const { time, output } = simulation;

        // Target output at one closed-loop time constant
        const target = expectedFinal * (1 - Math.exp(-1));
        let calculatedTau = null;

        // Find when the simulated response reaches the target
        for (let i = 1; i < time.length; i++) {
            const before = output[i - 1];
            const after = output[i];
            if (before <= target && after >= target) {
                // Interpolate between two simulation points
                const ratio = (target - before) / (after - before);
                calculatedTau = time[i - 1] + ratio * (time[i] - time[i - 1]);
                break;
            }
        }

        // Calculate the remaining error at the end
        const finalOutput = output[output.length - 1];
        const calculatedError = Math.abs(1 - finalOutput) * 100;

        // Compare simulation results with reference values
        const tauPassed =
            calculatedTau !== null &&
            Math.abs(calculatedTau - expectedTau) <= 0.001;

        const errorPassed = Math.abs(calculatedError - expectedError) <= 0.2;

        addValidationResult(
            "Test #1A - Closed-Loop Time Constant",
            "0.1000 s",
            calculatedTau === null
                ? "Not reached"
                : calculatedTau.toFixed(4) + " s",
            tauPassed
        );

        addValidationResult(
            "Test #1B - Steady-State Error",
            "10.00%",
            calculatedError.toFixed(2) + "%",
            errorPassed
        );


        // Official Validation Check #2: PI controller
        const piCase = {
            K: 1,
            tau: 1,
            Kp: 1,
            Ki: 1,
            Kd: 0,
            setpoint: 1,
            duration: 8,
            dt: 0.001,
            uMin: -20,
            uMax: 20
        };

        // Run the same numerical simulator used by P1
        const piSimulation = simulateFirstOrderPID(piCase);

        // Characteristic equation: s² + a*s + c = 0
        const a = (1 + piCase.K * piCase.Kp) / piCase.tau;
        const c = (piCase.K * piCase.Ki) / piCase.tau;

        // Natural frequency and damping ratio
        const calculatedWn = Math.sqrt(c);
        const calculatedZeta = a / (2 * calculatedWn);

        // Independently check the simulated output at t = 1 s
        const sampleIndex = piSimulation.time.findIndex(t => t >= 1);

        const calculatedY1 = piSimulation.output[sampleIndex];
        const expectedY1 = 1 - Math.exp(-1);

        // Check both model coefficients and simulation behavior
        const piPassed = Math.abs(calculatedWn - 1) <= 0.001 &&
            Math.abs(calculatedZeta - 1) <= 0.001 &&
            Math.abs(calculatedY1 - expectedY1) <= 0.002;

        addValidationResult(
            "Test #2 - PI Natural Frequency & Damping",
            "ωn = 1 rad/s, ζ = 1, y(1s) ≈ 0.6321",
            `ωn = ${calculatedWn.toFixed(3)} rad/s, ` +
            `ζ = ${calculatedZeta.toFixed(3)}, ` +
            `y(1s) = ${calculatedY1.toFixed(4)}`,
            piPassed
        );

        // Official Validation Check #3:
        // PI control removes steady-state step error
        // for stable and unsaturated systems.

        const piTestCases = [
            { Kp: 1, Ki: 1 },
            { Kp: 2, Ki: 1 },
            { Kp: 3, Ki: 2 }
        ];

        const piErrorResults = piTestCases.map(({ Kp, Ki }) => {

            // Simulate the same plant with different PI gains
            const response = simulateFirstOrderPID({
                K: 1,
                tau: 1,
                Kp,
                Ki,
                Kd: 0,
                setpoint: 1,
                duration: 30,
                dt: 0.001,
                uMin: -20,
                uMax: 20
            });

            // Calculate the error at the end of simulation
            const finalY = response.output[response.output.length - 1];

            const errorPercent = Math.abs(1 - finalY) * 100;

            return {
                Kp, Ki, errorPercent
            };
        });

        // Require every simulated case to approach zero error
        const test3Passed = piErrorResults.every(
            result => Number.isFinite(result.errorPercent) && result.errorPercent <= 0.05
        );

        // Show all calculated results
        const test3Details = piErrorResults.map(
            result =>
                `Kp=${result.Kp}, Ki=${result.Ki}: ` +
                `${result.errorPercent.toFixed(4)}%`
        ).join(" | ");

        addValidationResult(
            "Test #3 - PI Zero Steady-State Error",
            "0% (stable PI, reachable step setpoint)",
            test3Details,
            test3Passed
        );

    }

    validationButton.addEventListener("click", runP1Validation);
})();
