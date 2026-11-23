(function () {
    "use strict";

    const $ = id => document.getElementById(id);

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function readParameters() {
        const p = {
            K: Number($("msK").value),
            tau: Number($("msTau").value),
            target: Number($("msTargetRpm").value),
            zeta: Number($("msZeta").value),
            wn: Number($("msWn").value)
        };

        if (Object.values(p).some(v => !Number.isFinite(v) || v <= 0)) {
            throw new Error("Please enter valid positive parameters.");
        }

        return p;
    }

    // PI pole-placement design
    function designPI(p) {
        const Kp = (2 * p.zeta * p.wn * p.tau - 1) / p.K;

        const Ki = (p.tau * p.wn * p.wn) / p.K;

        if (Kp < 0) {
            throw new Error(
                "Negative Kp: adjust zeta or wn."
            );
        }

        return { Kp, Ki };
    }

    function runSimulation() {
        const status = $("msDesignStatus");

        try {
            const p = readParameters();
            const { Kp, Ki } = designPI(p);

            // Display PI gains
            $("msKpResult").textContent = Kp.toFixed(4);
            $("msKiResult").textContent = Ki.toFixed(4);
            $("msKdResult").textContent = "0.0000";

            // Simulation settings
            const duration = 6;
            const dt = Math.min(0.002, p.tau / 50);
            const steps = Math.ceil(duration / dt);
            const h = duration / steps;

            let y = 0;
            let integral = 0;
            let peak = 0;
            let lastOutside = -1;

            const t = [];
            const speed = [];
            const pwm = [];

            for (let i = 0; i <= steps; i++) {

                const time = i * h;

                // Feedback error
                const error = p.target - y;

                // PI controller
                const trialIntegral = integral + error * h;

                const requested = Kp * error + Ki * trialIntegral;

                // PWM saturation: 0 to 100%
                const u = clamp(requested, 0, 100);

                // Conditional anti-windup
                if (
                    (requested >= 0 && requested <= 100) ||
                    (requested > 100 && error < 0) ||
                    (requested < 0 && error > 0)
                ) {
                    integral = trialIntegral;
                }

                // Save simulation data
                t.push(time);
                speed.push(y);
                pwm.push(u);

                peak = Math.max(peak, y);

                // Check 2% settling band
                if (Math.abs(y - p.target) > 0.02 * p.target) {
                    lastOutside = i;
                }

                // First-order motor equation
                if (i < steps) {
                    y += h * (p.K * u - y) / p.tau;
                }
            }

            // Performance metrics
            const overshoot = Math.max(
                0,
                (peak / p.target - 1) * 100
            );

            const settling =
                lastOutside < steps
                    ? (lastOutside + 1) * h
                    : null;

            const finalError =
                Math.abs(
                    p.target - speed[speed.length - 1]
                ) / p.target * 100;

            $("msOvershoot").textContent = overshoot.toFixed(2) + "%";

            $("msSettling").textContent = settling === null ? "Not settled" : settling.toFixed(3) + " s";

            $("msError").textContent = finalError.toFixed(2) + "%";

            // My System: Design Specification Checks

            const maxPWM = Math.max(...pwm);

            const reachable = p.K * 100 >= p.target;

            function showCheck(id, passed, value) {
                $(id).textContent = (passed ? "PASS ✓ — " : "FAIL ✗ — ") + value;
                $(id).style.color = passed ? "#16803c" : "#dc2626";
                $(id).style.fontWeight = "bold";
            }

            // Damping ratio target
            showCheck(
                "msSpecDamping",
                p.zeta >= 0.6 && p.zeta <= 0.8,
                "ζ = " + p.zeta.toFixed(2)
            );

            // Overshoot target
            showCheck(
                "msSpecOvershoot",
                overshoot <= 10,
                overshoot.toFixed(2) + "%"
            );

            // Settling time target
            showCheck(
                "msSpecSettling",
                settling !== null && settling <= 2,
                settling === null
                    ? "Not settled"
                    : settling.toFixed(3) + " s"
            );

            // Error at the end of simulation
            showCheck(
                "msSpecError",
                finalError <= 1,
                finalError.toFixed(2) + "%"
            );

            // PWM bounds
            showCheck(
                "msSpecPWM",
                pwm.every(u => u >= 0 && u <= 100),
                "Maximum PWM = " + maxPWM.toFixed(2) + "%"
            );

            // Physical reachability within the assumed model
            showCheck(
                "msSpecReachability",
                reachable,
                "Maximum modeled speed = " +
                (p.K * 100).toFixed(1) + " RPM"
            );


            // Plotly charts
            if (!window.Plotly) {
                throw new Error("Plotly is unavailable.");
            }

            const config = {
                responsive: true,
                displaylogo: false
            };

            const textColor = getComputedStyle(document.body).color;

            const layout = yTitle => ({

                autosize: true,
                height: 300,
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(0,0,0,0)",
                font: { color: textColor },
                margin: {
                    l: 58, r: 15, t: 20, b: 50
                },
                xaxis: {
                    title: "Time (s)"
                },
                yaxis: {
                    title: yTitle
                },
                legend: {
                    orientation: "h",
                    y: 1.18
                }
            });

            Plotly.react("msSpeedPlot", [
                {
                    x: t,
                    y: speed,
                    mode: "lines",
                    name: "Simulated Motor Speed"
                },
                {
                    x: [0, duration],
                    y: [p.target, p.target],
                    mode: "lines",
                    name: "Target RPM",
                    line: { dash: "dash" }
                }
            ], layout("Speed (RPM)"), config);

            Plotly.react("msPwmPlot", [
                {
                    x: t,
                    y: pwm,
                    mode: "lines",
                    name: "PWM Duty (%)"
                },
                {
                    x: [0, duration],
                    y: [100, 100],
                    mode: "lines",
                    name: "100% Limit",
                    line: { dash: "dot" }
                }
            ], {
                ...layout("PWM (%)"),
                yaxis: {
                    title: "PWM (%)",
                    range: [0, 105]
                }
            }, config);

            status.textContent = "Simulation completed using current motor model parameters.";

        } catch (error) {
            status.textContent = error.message;
        }
    }


    function generateArduinoCode() {

        const status = $("msCodeStatus");

        try {

            const p = readParameters();
            const { Kp, Ki } = designPI(p);

            const code = `
// Micromouse PI Speed Controller
// First-order motor speed model
// ESP32 encoder integration and hardware testing pending

const float KP = ${Kp.toFixed(6)}f;
const float KI = ${Ki.toFixed(6)}f;
const float KD = 0.0f;

const float TARGET_RPM = ${p.target.toFixed(2)}f;

// Controller sampling period: 20 ms
const float TS = 0.02f;

// PWM duty percentage limits
const float PWM_MIN = 0.0f;
const float PWM_MAX = 100.0f;

float integral = 0.0f;

// Calculate PWM duty from measured speed
float computePWM(float measuredRPM) {

    float error = TARGET_RPM - measuredRPM;

    float trialIntegral = integral + error * TS;

    float requested = KP * error + KI * trialIntegral;

    float pwm = constrain(
        requested,
        PWM_MIN,
        PWM_MAX
    );

    // Conditional anti-windup
    bool pushingHigh = requested > PWM_MAX && error > 0;

    bool pushingLow = requested < PWM_MIN && error < 0;

    if (!(pushingHigh || pushingLow)) {
        integral = trialIntegral;
    }

    return pwm;
}

// TODO: Read actual motor RPM from encoder.
// TODO: Call computePWM once every 20 ms.
// TODO: Apply returned PWM through TB6612.
// TODO: Verify motor power supply before testing.
`;

            $("msArduinoCode").textContent =
                code.trim();

            status.textContent = "PI controller code generated using current motor parameters.";

        } catch (error) {

            status.textContent = error.message;

        }
    }



    function applyMotorModelToLabs() {

        const status = $("msBridgeStatus");

        try {

            // Read current My System parameters
            const p = readParameters();
            // Normalize RPM and PWM for P1-P3
            const normalizedK = (100 * p.K) / p.target;

            // P1 is the shared plant model
            const gainSlider = $("p1K");
            const tauSlider = $("p1Tau");
            const plantSelector = $("p1PlantType");
            const setpointSlider = $("p1Setpoint");
            const p3Limit = $("p3UMax");

            if (
                !gainSlider ||
                !tauSlider ||
                !plantSelector ||
                !setpointSlider ||
                !p3Limit
            ) {
                throw new Error("Some Control Lab elements are missing.");
            }

            // Check the supported slider ranges
            if (
                normalizedK < Number(gainSlider.min) ||
                normalizedK > Number(gainSlider.max) ||
                p.tau < Number(tauSlider.min) ||
                p.tau > Number(tauSlider.max)
            ) {
                throw new Error(
                    "Motor parameters are outside the P1 slider range."
                );
            }

            // Select the first-order system
            plantSelector.value = "first";

            plantSelector.dispatchEvent(
                new Event("change", { bubbles: true })
            );

            // Apply normalized motor model
            gainSlider.value = normalizedK.toFixed(2);
            tauSlider.value = p.tau.toFixed(2);

            // Normalized desired output
            setpointSlider.value = "1";

            // Notify P1, P2 and P3 of the changes
            [gainSlider, tauSlider, setpointSlider]
                .forEach(slider => {

                    slider.dispatchEvent(
                        new Event("input", {
                            bubbles: true
                        })
                    );

                });

            // In P3, normalized PWM = 1 means 100%
            p3Limit.value = "1";

            p3Limit.dispatchEvent(new Event("input", { bubbles: true }));

            // Transfer PI controller gains to P3

            const gains = designPI(p);

            // Convert gains from RPM/PWM% to
            // normalized output and control units
            const scale = p.target / 100;

            const normalizedKp = gains.Kp * scale;
            const normalizedKi = gains.Ki * scale;

            const p3Kp = $("p3Kp");
            const p3Ki = $("p3Ki");
            const p3Kd = $("p3Kd");

            if (!p3Kp || !p3Ki || !p3Kd) {
                throw new Error("P3 controller controls are missing.");
            }

            if (
                normalizedKp < Number(p3Kp.min) ||
                normalizedKp > Number(p3Kp.max) ||
                normalizedKi < Number(p3Ki.min) ||
                normalizedKi > Number(p3Ki.max)
            ) {
                throw new Error(
                    "Calculated PI gains are outside P3 slider limits."
                );
            }

            p3Kp.value = normalizedKp.toFixed(4);
            p3Ki.value = normalizedKi.toFixed(4);
            p3Kd.value = "0";

            // Trigger P3 simulation updates
            [p3Kp, p3Ki, p3Kd].forEach(slider => {
                slider.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
            });


            // Transfer the same normalized PI gains to P2
            const p2Kp = $("p2Kp");
            const p2Ki = $("p2Ki");
            const p2Kd = $("p2Kd");

            if (!p2Kp || !p2Ki || !p2Kd) {
                throw new Error("P2 controller controls are missing.");
            }

            if (
                normalizedKp < Number(p2Kp.min) ||
                normalizedKp > Number(p2Kp.max) ||
                normalizedKi < Number(p2Ki.min) ||
                normalizedKi > Number(p2Ki.max)
            ) {
                throw new Error("PI gains are outside P2 slider limits.");
            }

            p2Kp.value = normalizedKp.toFixed(4);
            p2Ki.value = normalizedKi.toFixed(4);
            p2Kd.value = "0";

            [p2Kp, p2Ki, p2Kd].forEach(slider => {
                slider.dispatchEvent(
                    new Event("input", { bubbles: true })
                );
            });



            status.textContent = "Motor model applied to P1, P2 and P3. " +
                "Normalized K = " +
                normalizedK.toFixed(2) +
                ", tau = " +
                p.tau.toFixed(2) + " s.";

        } catch (error) {

            status.textContent = error.message;

        }
    }


    $("msDesignBtn").addEventListener(
        "click", runSimulation
    );

    $("msSimulateBtn").addEventListener(
        "click", runSimulation
    );

    $("msGenerateCodeBtn").addEventListener(
        "click", generateArduinoCode
    );

    // Connect My System to P1, P2 and P3
    $("msBridgeBtn").addEventListener(
        "click", applyMotorModelToLabs
    );

    runSimulation();

})();



