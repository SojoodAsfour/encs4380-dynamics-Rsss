
(function () {
    "use strict";

    const $ = id => document.getElementById(id);

    // Check required elements
    const requiredIds = ["p2TauS", "p2Kp", "p2Ki", "p2Kd", "p2SensorPlot", "p2CheckPrediction", "p2PlantInfo"];

    if (requiredIds.some(id => !$(id)) || !window.Plotly) {
        console.error("P2: Required elements or Plotly are missing.");
        return;
    }

    // Read the first-order plant parameters from P1
    function getPlantParameters() {
        const gainElement = $("p1K");
        const tauElement = $("p1Tau");

        return { K: gainElement ? Number(gainElement.value) : 1, tau: tauElement ? Number(tauElement.value) : 1 };
    }

    // PID simulation with a first-order sensor in the feedback path
    function simulateSensorPID({ K, tau, tauS, Kp, Ki, Kd, setpoint = 1, duration = 20, dt = 0.001, uMin = -20, uMax = 20 }) {
        const time = [];
        const trueOutput = [];
        const measuredOutput = [];
        const control = [];

        let y = 0;
        let ym = 0;
        let integral = 0;
        let previousMeasured = 0;

        const steps = Math.ceil(duration / dt);
        const actualDt = duration / steps;

        for (let i = 0; i <= steps; i++) {
            const t = i * actualDt;
            const error = setpoint - ym;

            // Derivative on measured sensor output
            const derivative = (ym - previousMeasured) / actualDt;

            // PID controller sees the sensor measurement
            const requestedU = Kp * error + Ki * integral - Kd * derivative;

            // Actuator saturation
            const u = Math.max(uMin, Math.min(uMax, requestedU));

            time.push(t);
            trueOutput.push(y);
            measuredOutput.push(ym);
            control.push(u);

            if (i === steps) break;

            // Conditional anti-windup
            const pushingUpper = requestedU >= uMax && error > 0;
            const pushingLower = requestedU <= uMin && error < 0;

            if (Ki > 0 && !pushingUpper && !pushingLower) {
                integral += error * actualDt;
            }

            // First-order plant:
            // tau * dy/dt + y = K*u
            const plantDerivative = (K * u - y) / tau;

            // First-order sensor:
            // tauS * d(ym)/dt + ym = y
            const sensorDerivative = (y - ym) / tauS;

            previousMeasured = ym;

            y += plantDerivative * actualDt;
            ym += sensorDerivative * actualDt;
        }

        return { time, trueOutput, measuredOutput, control };
    }

    // Calculate overshoot relative to the expected final value
    function calculateOvershoot(values, finalValue) {
        const initial = values[0];
        const change = finalValue - initial;

        if (Math.abs(change) < 1e-9) {
            return 0;
        }

        let peakFraction = -Infinity;

        for (const value of values) {
            const fraction = (value - initial) / change;
            peakFraction = Math.max(peakFraction, fraction);
        }

        return Math.max(0, (peakFraction - 1) * 100);
    }

    // Count crossings of the setpoint
    function countCrossings(values, setpoint) {
        let crossings = 0;

        for (let i = 1; i < values.length; i++) {
            const previous = values[i - 1] - setpoint;
            const current = values[i] - setpoint;

            if ((previous < 0 && current >= 0) || (previous > 0 && current <= 0)) {
                crossings++;
            }
        }

        return crossings;
    }

    // Detect whether the system oscillations are sustained or decreasing over time
    function isSustainedOscillation(values, setpoint) {
        const start = Math.floor(values.length * 0.7);
        const tail = values.slice(start);

        if (tail.length < 10) {
            return false;
        }

        const mean = tail.reduce((sum, value) => sum + value, 0) / tail.length;

        const middle = Math.floor(tail.length / 2);
        const firstHalf = tail.slice(0, middle);
        const secondHalf = tail.slice(middle);

        function getSwing(data) {
            return Math.max(...data) - Math.min(...data);
        }

        const totalSwing = getSwing(tail);
        const earlySwing = getSwing(firstHalf);
        const lateSwing = getSwing(secondHalf);

        const crossingsAroundMean = countCrossings(tail, mean);

        const significantOscillation =
            totalSwing > 0.05 * Math.max(Math.abs(setpoint), 1e-9);

        const amplitudeNotDying =
            lateSwing >= earlySwing * 0.65;

        return significantOscillation &&
            crossingsAroundMean >= 4 &&
            amplitudeNotDying;
    }

    function runSimulation(tauSOverride = null) {
        const plant = getPlantParameters();

        const settings = { K: plant.K, tau: plant.tau, tauS: tauSOverride ?? Number($("p2TauS").value), Kp: Number($("p2Kp").value), Ki: Number($("p2Ki").value), Kd: Number($("p2Kd").value), setpoint: 1 };

        return simulateSensorPID(settings);
    }

    function updateP2() {
        const tauS = Number($("p2TauS").value);
        const Kp = Number($("p2Kp").value);
        const Ki = Number($("p2Ki").value);
        const Kd = Number($("p2Kd").value);
        const plant = getPlantParameters();

        $("p2PlantInfo").textContent = `Plant: K=${plant.K}, τ=${plant.tau} (First-Order)`;
        $("p2TauSValue").textContent = tauS.toFixed(2) + " s";
        $("p2KpValue").textContent = Kp.toFixed(1);
        $("p2KiValue").textContent = Ki.toFixed(1);
        $("p2KdValue").textContent = Kd.toFixed(2);

        const simulation = runSimulation();

        const expectedFinal = Ki > 0 ? 1 : (plant.K * Kp) / (1 + plant.K * Kp);

        const overshoot = calculateOvershoot(simulation.trueOutput, expectedFinal);

        const difference = Math.max(
            ...simulation.trueOutput.map(
                (value, i) =>
                    Math.abs(value - simulation.measuredOutput[i])
            )
        );

        const crossings = countCrossings(simulation.trueOutput, 1);

        const sustained = isSustainedOscillation(simulation.trueOutput, 1);

        $("p2Overshoot").textContent = overshoot.toFixed(2) + "%";

        $("p2SensorDifference").textContent = difference.toFixed(4);

        $("p2Crossings").textContent = crossings;

        $("p2Status").textContent =
            sustained
                ? "Sustained or growing oscillation: the closed-loop response is not settling."
                : crossings > 1
                    ? "Damped oscillation: the output crosses the setpoint but the oscillations decrease."
                    : overshoot > 1
                        ? "Overshoot detected. Sensor delay affects the feedback response."
                        : "The response is relatively well damped for the current settings.";

        const styles = getComputedStyle(document.documentElement);

        const primary = styles.getPropertyValue("--primary").trim() || "#3158B8";

        const accent = styles.getPropertyValue("--accent").trim() || "#DA91AA";

        const textColor = getComputedStyle(document.body).color;

        const layout = {
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { color: textColor },
            margin: { l: 55, r: 20, t: 20, b: 55 },
            xaxis: { title: { text: "Time (s)" }, gridcolor: "rgba(140,150,180,0.2)" },
            yaxis: { title: { text: "Output" }, gridcolor: "rgba(140,150,180,0.2)" },
            legend: { orientation: "h", y: 1.15 }
        };

        const config = { responsive: true, displaylogo: false };

        Plotly.react("p2SensorPlot", [
            {
                x: simulation.time,
                y: simulation.trueOutput,
                type: "scatter",
                mode: "lines",
                name: "True Plant Output",
                line: { color: primary, width: 3 }
            },
            {
                x: simulation.time,
                y: simulation.measuredOutput,
                type: "scatter",
                mode: "lines",
                name: "Sensor Measurement",
                line: {
                    color: accent,
                    width: 2,
                    dash: "dash"
                }
            },
            {
                x: [0, simulation.time[simulation.time.length - 1]],
                y: [1, 1],
                type: "scatter",
                mode: "lines",
                name: "Setpoint",
                line: {
                    color: textColor,
                    width: 1,
                    dash: "dot"
                }
            }], layout, config);
    }

    // Live controls
    [
        "p2TauS",
        "p2Kp",
        "p2Ki",
        "p2Kd"
    ].forEach(id => { $(id).addEventListener("input", updateP2); });

    // Update when P1 plant parameters change
    ["p1K", "p1Tau"].forEach(id => {
        if ($(id)) {
            $(id).addEventListener("input", updateP2);
        }
    });

    // Redraw when the theme changes
    window.addEventListener("transient-theme-change", updateP2);

    // Predict, then Check
    $("p2CheckPrediction").addEventListener("click", () => {
        const choice = $("p2Prediction").value;
        const result = $("p2PredictionResult");

        result.classList.remove("hidden");

        if (!choice) {
            result.textContent = "Please select your prediction first.";
            return;
        }

        const baseline = runSimulation(0.05);
        const slowerSensor = runSimulation(1.0);

        const plant = getPlantParameters();

        const Kp = Number($("p2Kp").value);
        const Ki = Number($("p2Ki").value);

        const expectedFinal = Ki > 0 ? 1 : (plant.K * Kp) / (1 + plant.K * Kp);

        const baselineOvershoot = calculateOvershoot(baseline.trueOutput,expectedFinal);

        const slowerOvershoot = calculateOvershoot(slowerSensor.trueOutput,expectedFinal);

        const actual = slowerOvershoot > baselineOvershoot + 0.1 ? "increase"
            : slowerOvershoot < baselineOvershoot - 0.1
                ? "decrease"
                : "same";

        const correct = choice === actual;

        result.textContent =
            (correct ? "Correct prediction! " : "Not quite. ") +
            "With τs = 0.05 s, overshoot is " +
            baselineOvershoot.toFixed(2) + "%. " +
            "With τs = 1.00 s, overshoot is " +
            slowerOvershoot.toFixed(2) + "%. " +
            "A slower sensor adds delay to the feedback path, " +
            "which can increase overshoot and cause oscillatory behavior.";
    });

    // Initial display
    updateP2();

})();
