(function () {
    "use strict";

    const $ = id => document.getElementById(id);

    const requiredIds = [
        "p3Ts", "p3Kp", "p3Ki", "p3Kd", "p3UMax", "p3AntiWindup",
        "p3OutputPlot", "p3ControlPlot", "p3SweepPlot", "p3Code",
        "p3CopyCode", "p3CheckPrediction", "p3Prediction", "p3PredictionResult",
        "p3TsValue", "p3KpValue", "p3KiValue", "p3KdValue", "p3UMaxValue",
        "p3Overshoot", "p3Settling", "p3SteadyError", "p3Status"
    ];

    if (requiredIds.some(id => !$(id)) || !window.Plotly) {
        console.error("P3: Required elements or Plotly are missing.");
        return;
    }

    const SETPOINT = 1;
    const DURATION = 10;

    // First-order plant parameters come from P1 
    function getPlantParameters() {
        return {
            K: $("p1K") ? Number($("p1K").value) : 1,
            tau: $("p1Tau") ? Number($("p1Tau").value) : 1
        };
    }

    /*
     * Digital PID, exactly as in the homework:
     *   u[k] = Kp e[k] + Ki Ts * sum(e[0..k]) + Kd (e[k] - e[k-1]) / Ts
     * The controller runs only every Ts seconds and holds u (zero-order hold).
     * The continuous plant is stepped with Euler on a finer grid h = Ts / n.
     */
    function simulateDigitalPID({ K, tau, Kp, Ki, Kd, Ts, antiWindup, uMax, maxH = 0.0005 }) {
        const uMin = 0;                    // unipolar actuator (PWM 0..Umax), same as the Arduino code
        const n = Math.max(1, Math.ceil(Ts / Math.min(maxH, tau / 20)));
        const h = Ts / n;
        const samples = Math.round(DURATION / Ts);

        let y = 0;
        let integral = 0;
        let ePrev = SETPOINT - y;          // no derivative kick at k = 0

        const t = [], yOut = [], ts = [], us = [];

        for (let k = 0; k < samples; k++) {
            const e = SETPOINT - y;

            const integralTrial = integral + e * Ts;
            const uRequested = Kp * e + Ki * integralTrial + Kd * (e - ePrev) / Ts;
            const u = Math.max(uMin, Math.min(uMax, uRequested));

            // Anti-windup: do not keep integrating while saturated and pushing further
            const pushing = (uRequested > uMax && e > 0) || (uRequested < uMin && e < 0);
            if (!(antiWindup && pushing)) integral = integralTrial;

            ePrev = e;
            ts.push(k * Ts);
            us.push(u);

            for (let j = 0; j < n; j++) {
                t.push((k * n + j) * h);
                yOut.push(y);
                y += h * (K * u - y) / tau;      // Euler step of tau*y' + y = K*u
            }
        }

        t.push(samples * Ts);
        yOut.push(y);

        return { t, y: yOut, ts, u: us };
    }

    function calculateMetrics(sim, finalValue) {
        const { t, y } = sim;
        const last = y.length - 1;

        if (!y.every(Number.isFinite)) {
            return { overshoot: null, settling: null, steadyError: null, iae: Infinity, diverged: true };
        }

        // Overshoot relative to the expected final value
        const peak = Math.max(...y);

        const overshoot = Math.max(
            0,
            (peak / SETPOINT - 1) * 100
        );


        // Last sample outside the ±2% band around the final value
        let lastOutside = -1;
        for (let i = 0; i <= last; i++) {

            if (Math.abs(y[i] - SETPOINT) > 0.02 * SETPOINT) {
                lastOutside = i;
            }

        }
        // The output must stay inside the band for the last 10% of the run. Checking only the
        // final sample is not enough: a limit cycle can cross the band exactly at the end.
        const settled = lastOutside < Math.floor(last * 0.9);
        const settling = settled ? (lastOutside < 0 ? 0 : t[lastOutside + 1]) : null;

        // Steady-state error: mean of the last 3% of the run
        const tail = y.slice(Math.floor(y.length * 0.97));
        const mean = tail.reduce((a, b) => a + b, 0) / tail.length;

        const steadyError = Math.abs(SETPOINT - mean) / SETPOINT * 100;

        // Integral of absolute error
        let iae = 0;
        for (let i = 1; i <= last; i++) iae += Math.abs(SETPOINT - y[i]) * (t[i] - t[i - 1]);

        return { overshoot, settling, steadyError, iae, diverged: false };
    }

    function expectedFinal({ K, Kp, Ki, uMax }) {
        const ideal = Ki > 0 ? SETPOINT : (K * Kp) / (1 + K * Kp) * SETPOINT;
        return Math.min(ideal, K * uMax);       // actuator limit may make the setpoint unreachable
    }

    function readSettings(TsOverride = null) {
        const plant = getPlantParameters();
        return {
            K: plant.K,
            tau: plant.tau,
            Ts: TsOverride ?? Number($("p3Ts").value),
            Kp: Number($("p3Kp").value),
            Ki: Number($("p3Ki").value),
            Kd: Number($("p3Kd").value),
            uMax: Number($("p3UMax").value),
            antiWindup: $("p3AntiWindup").checked
        };
    }

    // Arduino code generated from the current settings
    function buildArduinoCode({ Kp, Ki, Kd, Ts, uMax, antiWindup }) {
        const tsUs = Math.round(Ts * 1e6);
        const windup = antiWindup
            ? [
                "  // Anti-windup: freeze the integral while saturated and pushing further",
                "  bool pushingHigh = (uRequested > U_MAX) && (error > 0);",
                "  bool pushingLow  = (uRequested < U_MIN) && (error < 0);",
                "  if (!(pushingHigh || pushingLow)) integral = integralTrial;"
            ]
            : [
                "  // Anti-windup OFF: the integral always accumulates",
                "  integral = integralTrial;"
            ];

        return [
            "// Digital PID: u[k] = Kp*e + Ki*Ts*sum(e) + Kd*(e - ePrev)/Ts",
            "const float Kp = " + Kp.toFixed(2) + ";",
            "const float Ki = " + Ki.toFixed(2) + ";",
            "const float Kd = " + Kd.toFixed(2) + ";",
            "const unsigned long TS_US = " + tsUs + "UL;      // sampling time = " + (Ts * 1000).toFixed(1) + " ms",
            "const float Ts = TS_US / 1000000.0;",
            "const float SETPOINT = " + SETPOINT.toFixed(2) + ";   // in the same units as readOutput()",
            "const float U_MIN = " + (0).toFixed(2) + ";",
            "const float U_MAX = " + uMax.toFixed(2) + ";",
            "const int SENSOR_PIN = A0;",
            "const int PWM_PIN = 9;",
            "",
            "float integral = 0;",
            "float ePrev = 0;",
            "unsigned long lastMicros = 0;",
            "",
            "// Scale the ADC reading to the units of SETPOINT (edit this for your sensor)",
            "float readOutput() {",
            "  return analogRead(SENSOR_PIN) * (1.0 / 1023.0);",
            "}",
            "",
            "void setup() {",
            "  pinMode(PWM_PIN, OUTPUT);",
            "  ePrev = SETPOINT - readOutput();   // avoids a derivative kick on the first sample",
            "  lastMicros = micros();",
            "}",
            "",
            "void loop() {",
            "  // Run the controller exactly once every Ts",
            "  if (micros() - lastMicros < TS_US) return;",
            "  lastMicros += TS_US;",
            "",
            "  float error = SETPOINT - readOutput();",
            "  float integralTrial = integral + error * Ts;",
            "  float uRequested = Kp * error + Ki * integralTrial + Kd * (error - ePrev) / Ts;",
            "  float u = constrain(uRequested, U_MIN, U_MAX);",
            "",
            ...windup,
            "",
            "  ePrev = error;",
            "",
            "  // The actuator is unipolar (PWM 0..U_MAX), exactly as in the simulation.",

            "  float pwmFraction = (U_MAX > U_MIN) ? (u - U_MIN) / (U_MAX - U_MIN) : 0.0f;",
            "  analogWrite(PWM_PIN, (int)(pwmFraction * 255.0f));",

            "}"
        ].join("\n");
    }

    function chartStyle() {
        const styles = getComputedStyle(document.documentElement);
        return {
            primary: styles.getPropertyValue("--primary").trim() || "#3158B8",
            accent: styles.getPropertyValue("--accent").trim() || "#DA91AA",
            text: getComputedStyle(document.body).color,
            grid: "rgba(140,150,180,0.2)"
        };
    }

    function baseLayout(c, yTitle) {
        return {
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(0,0,0,0)",
            font: { color: c.text },
            margin: { l: 55, r: 20, t: 20, b: 55 },
            xaxis: { title: { text: "Time (s)" }, gridcolor: c.grid },
            yaxis: { title: { text: yTitle }, gridcolor: c.grid, automargin: true },
            legend: { orientation: "h", y: 1.2 }
        };
    }

    function downsample(values, maxPoints = 1500) {
        const stride = Math.max(1, Math.ceil(values.length / maxPoints));
        return values.filter((_, i) => i % stride === 0 || i === values.length - 1);
    }

    // How performance changes as Ts grows (same gains)
    const SWEEP_TS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5];

    function runSweep(settings) {
        return SWEEP_TS.map(Ts => {
            const sim = simulateDigitalPID({ ...settings, Ts, maxH: 0.002 });
            const m = calculateMetrics(sim, expectedFinal(settings));
            return {
                Ts,
                overshoot: m.overshoot === null ? null : Math.min(m.overshoot, 500),
                settling: m.settling === null ? DURATION : m.settling,
                settled: m.settling !== null
            };
        });
    }

    function updateP3() {
        const s = readSettings();

        $("p3TsValue").textContent = (s.Ts * 1000).toFixed(0) + " ms";
        $("p3KpValue").textContent = s.Kp.toFixed(1);
        $("p3KiValue").textContent = s.Ki.toFixed(1);
        $("p3KdValue").textContent = s.Kd.toFixed(2);
        $("p3UMaxValue").textContent = s.uMax.toFixed(1);
        if ($("p3PlantInfo")) $("p3PlantInfo").textContent = `Plant: K=${s.K}, τ=${s.tau} (First-Order)`;

        const sim = simulateDigitalPID(s);
        const finalValue = expectedFinal(s);
        const m = calculateMetrics(sim, finalValue);

        $("p3Overshoot").textContent = m.overshoot === null ? "Diverged" : m.overshoot.toFixed(2) + "%";
        $("p3Settling").textContent = m.settling === null ? "Not settled" : m.settling.toFixed(3) + " s";
        $("p3SteadyError").textContent = m.steadyError === null ? "Not settled" : m.steadyError.toFixed(2) + "%";
        if ($("p3Iae")) $("p3Iae").textContent = m.iae.toFixed(3);

        // Status message: compare Ts with the closed-loop speed
        const tauCL = s.tau / (1 + s.K * s.Kp);

        let status;

        if (s.uMax <= 0) {
            status = "The actuator limit is zero. The controller cannot apply any control signal, so the plant cannot reach the setpoint.";

        } else if (s.K * s.uMax < SETPOINT) {
            status = "The setpoint is unreachable because the maximum plant output is below the setpoint.";

        } else if (m.settling === null) {
            status = "The response does not settle within the simulation time. Check the sampling time, PID gains, and actuator saturation.";

        } else if (s.Ts > tauCL / 2) {
            status = `Ts is large compared with the closed-loop time constant (≈ ${tauCL.toFixed(3)} s). The response may be degraded.`;

        } else {
            status = `Ts is small compared with the closed-loop time constant (≈ ${tauCL.toFixed(3)} s). The digital loop behaves almost like a continuous one.`;
        }

        $("p3Status").textContent = status;

        const c = chartStyle();
        const config = { responsive: true, displaylogo: false };
        const t = downsample(sim.t);
        const y = downsample(sim.y);
        const end = sim.t[sim.t.length - 1];

        Plotly.react("p3OutputPlot", [
            { x: t, y, type: "scatter", mode: "lines", name: "Plant Output", line: { color: c.primary, width: 3 } },
            { x: [0, end], y: [SETPOINT, SETPOINT], type: "scatter", mode: "lines", name: "Setpoint", line: { color: c.accent, width: 2, dash: "dash" } }
        ], baseLayout(c, "Output"), config);

        // Stair-step control signal: u is held between samples
        const tu = downsample(sim.ts);
        const u = downsample(sim.u);
        const ctrlLayout = baseLayout(c, "Control u");
        Plotly.react("p3ControlPlot", [
            { x: tu, y: u, type: "scatter", mode: "lines", name: "u[k] (held)", line: { color: c.primary, width: 2.5, shape: "hv" } },
            { x: [0, end], y: [s.uMax, s.uMax], type: "scatter", mode: "lines", name: "Limits", line: { color: c.accent, dash: "dot" } },
            { x: [0, end], y: [0, 0], type: "scatter", mode: "lines", showlegend: false, line: { color: c.accent, dash: "dot" } }
        ], ctrlLayout, config);

        // Performance versus Ts
        const sweep = runSweep(s);
        const sweepLayout = baseLayout(c, "Overshoot (%)");
        sweepLayout.xaxis = { title: { text: "Sampling time Ts (s)" }, type: "log", gridcolor: c.grid };
        sweepLayout.yaxis2 = {
            title: { text: "Settling time (s)" },
            overlaying: "y",
            side: "right",
            gridcolor: "rgba(0,0,0,0)"
        };
        sweepLayout.margin = { l: 55, r: 55, t: 20, b: 55 };
        sweepLayout.shapes = [{
            type: "line", xref: "x", yref: "paper",
            x0: s.Ts, x1: s.Ts, y0: 0, y1: 1,
            line: { color: c.text, width: 1, dash: "dot" }
        }];

        Plotly.react("p3SweepPlot", [
            {
                x: sweep.map(p => p.Ts), y: sweep.map(p => p.overshoot),
                type: "scatter", mode: "lines+markers", name: "Overshoot (%)",
                line: { color: c.primary, width: 3 }
            },
            {
                x: sweep.map(p => p.Ts), y: sweep.map(p => p.settling),
                type: "scatter", mode: "lines+markers", name: `Settling time (s), ${DURATION} = not settled`,
                yaxis: "y2", line: { color: c.accent, width: 3 },
                marker: { symbol: sweep.map(p => (p.settled ? "circle" : "x")), size: 9 }
            }
        ], sweepLayout, config);

        $("p3Code").textContent = buildArduinoCode(s);
    }

    // Live controls
    ["p3Ts", "p3Kp", "p3Ki", "p3Kd", "p3UMax"].forEach(id => $(id).addEventListener("input", updateP3));
    $("p3AntiWindup").addEventListener("change", updateP3);
    ["p1K", "p1Tau"].forEach(id => { if ($(id)) $(id).addEventListener("input", updateP3); });
    window.addEventListener("transient-theme-change", updateP3);

    // Copy button
    $("p3CopyCode").addEventListener("click", async () => {
        const text = $("p3Code").textContent;
        const label = $("p3CopyStatus");
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            // Fallback for browsers without clipboard permission
            const area = document.createElement("textarea");
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            area.remove();
        }
        if (label) {
            label.textContent = "Copied!";
            setTimeout(() => { label.textContent = ""; }, 1500);
        }
    });

    // Predict, then Check
    $("p3CheckPrediction").addEventListener("click", () => {
        const choice = $("p3Prediction").value;
        const result = $("p3PredictionResult");

        result.classList.remove("hidden");

        if (!choice) {
            result.textContent = "Please select your prediction first.";
            return;
        }

        const settings = readSettings();
        const fast = simulateDigitalPID({ ...settings, Ts: 0.01 });
        const slow = simulateDigitalPID({ ...settings, Ts: 0.5 });
        const finalValue = expectedFinal(settings);
        const mFast = calculateMetrics(fast, finalValue);
        const mSlow = calculateMetrics(slow, finalValue);

        // Compare performance by the integral of absolute error
        const actual = mSlow.iae > mFast.iae * 1.05 ? "worse"
            : mSlow.iae < mFast.iae * 0.95 ? "better"
                : "same";

        const fmtOvershoot = m => m.overshoot === null ? "diverged" : m.overshoot.toFixed(1) + "%";
        const describe = m => m.settling === null
            ? "it does not settle"
            : `settling time ${m.settling.toFixed(2)} s`;

        result.textContent =
            (choice === actual ? "Correct prediction! " : "Not quite. ") +
            `With Ts = 10 ms: overshoot ${fmtOvershoot(mFast)}, ${describe(mFast)}. ` +
            `With Ts = 500 ms: overshoot ${fmtOvershoot(mSlow)}, ${describe(mSlow)}. ` +
            "A larger Ts means the controller looks at the plant less often and holds each command longer, " +
            "which acts like extra delay and can make the loop oscillate or become unstable.";
    });

    updateP3();
})();