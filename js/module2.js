/*
 * Module 2 — First-order frequency response
 * M = 1 / sqrt(1 + (omega*tau)^2)
 * phi = -atan(omega*tau)
 * delta = M - 1
 */

(() => {
    const tauSlider = document.getElementById("m2Tau");
    const omegaSlider = document.getElementById("m2Omega");

    if (!tauSlider || !omegaSlider || typeof Plotly === "undefined") return;

    const $ = (id) => document.getElementById(id);
    const radToDeg = (rad) => rad * 180 / Math.PI;

    function colors() {
        const css = getComputedStyle(document.documentElement);

        return {
            background: css.getPropertyValue("--surface-soft").trim(),
            text: css.getPropertyValue("--text").trim(),
            grid: css.getPropertyValue("--chart-grid").trim(),
            primary: css.getPropertyValue("--primary").trim(),
            accent: css.getPropertyValue("--accent").trim()
        };
    }

    function calculate(tau, omega) {
        const ratio = omega * tau;

        return {
            magnitude: 1 / Math.sqrt(1 + ratio * ratio),
            phase: -Math.atan(ratio),
            cutoff: 1 / tau
        };
    }

    function updateModule2() {
        const tau = Number(tauSlider.value);
        const omega = Number(omegaSlider.value);

        const result = calculate(tau, omega);
        const c = colors();

        $("m2TauValue").textContent = tau.toFixed(2) + " s";
        $("m2OmegaValue").textContent = omega.toFixed(2) + " rad/s";

        $("m2Amplitude").textContent = result.magnitude.toFixed(3);

        $("m2Phase").textContent = Math.abs(radToDeg(result.phase)).toFixed(1) + "°";

        $("m2Cutoff").textContent = result.cutoff.toFixed(2) + " rad/s";

        $("m2Error").textContent = ((result.magnitude - 1) * 100).toFixed(1) + "%";

        // Input and output sine waves
        const period = 2 * Math.PI / omega;
        const endTime = 3 * period;

        const time = [];
        const input = [];
        const output = [];

        const phase = result.phase;

        for (let i = 0; i <= 500; i++) {
            const t = endTime * i / 500;

            time.push(t);
            input.push(Math.sin(omega * t));

            output.push(
                result.magnitude * Math.sin(omega * t + phase)
            );
        }

        Plotly.react("m2SinePlot", [
            {
                x: time,
                y: input,
                type: "scatter",
                mode: "lines",
                name: "Input x(t)",
                line: {color: c.accent,width: 2.5}
            },
            {
                x: time,
                y: output,
                type: "scatter",
                mode: "lines",
                name: "Output y(t)",
                line: {color: c.primary,width: 3}
            }
        ], {
            paper_bgcolor: c.background,
            plot_bgcolor: c.background,
            font: {
                color: c.text
            },
            margin: {l: 55,r: 20,t: 25,b: 55},
            xaxis: {title: "Time (s)",gridcolor: c.grid},
            yaxis: {
                title: "Amplitude",gridcolor: c.grid,range: [-1.2, 1.2]},
            legend: {
                orientation: "h",
                x: 0,
                y: 1.15
            }
        }, {
            responsive: true,
            displaylogo: false
        });

        // Bode response
        const frequencies = [];
        const magnitudesDb = [];
        const phases = [];

        const minW = 0.01 / tau;
        const maxW = 100 / tau;

        for (let i = 0; i <= 250; i++) {
            const w = minW * Math.pow(maxW / minW, i / 250);

            const r = calculate(tau, w);

            frequencies.push(w);
            magnitudesDb.push(20 * Math.log10(r.magnitude));
            phases.push(radToDeg(r.phase));
        }

        const currentDb = 20 * Math.log10(result.magnitude);

        Plotly.react("m2BodePlot", [
            {
                x: frequencies,
                y: magnitudesDb,
                type: "scatter",
                mode: "lines",
                name: "Magnitude (dB)",
                line: {color: c.primary,width: 3},
                xaxis: "x",
                yaxis: "y"
            },
            {
                x: frequencies,
                y: phases,
                type: "scatter",
                mode: "lines",
                name: "Phase (degrees)",
                line: {color: c.accent,width: 3},
                xaxis: "x2",
                yaxis: "y2"
            },
            {
                x: [result.cutoff],
                y: [-3.0103],
                type: "scatter",
                mode: "markers",
                name: "Cutoff (−3 dB)",
                marker: {color: c.accent,size: 10},
                xaxis: "x",
                yaxis: "y"
            },
            {
                x: [omega],
                y: [currentDb],
                type: "scatter",
                mode: "markers",
                name: "Selected frequency",
                marker: { color: c.text,size: 9},
                xaxis: "x",
                yaxis: "y"
            }
        ], {
            paper_bgcolor: c.background,
            plot_bgcolor: c.background,
            font: {color: c.text },
            margin: { l: 65, r: 25, t: 30, b: 65 },
            grid: { rows: 2, columns: 1, pattern: "independent" },
            xaxis: { type: "log", title: "Angular frequency ω (rad/s)", gridcolor: c.grid },
            yaxis: { title: "Magnitude (dB)", gridcolor: c.grid },
            xaxis2: { type: "log", title: "Angular frequency ω (rad/s)", gridcolor: c.grid },
            yaxis2: { title: "Phase (degrees)", gridcolor: c.grid },
            showlegend: true,
            legend: { orientation: "h", x: 0, y: 1.12}
        }, {
            responsive: true,
            displaylogo: false
        });
    }

    // Update plots when sliders change
    tauSlider.addEventListener("input", updateModule2);
    omegaSlider.addEventListener("input", updateModule2);

    // Update plots when theme changes
    window.addEventListener("transient-theme-change", updateModule2);

    // Validation button
    $("m2Validate").addEventListener("click", () => {
        const tau = 0.2;
        const omega = 2;

        const result = calculate(tau, omega);

        const amplitudePercent = result.magnitude * 100;
        const phaseDegrees = Math.abs(radToDeg(result.phase));

        const amplitudePass = Math.abs(amplitudePercent - 93.0) < 0.6;
        const phasePass = Math.abs(phaseDegrees - 21.8) < 0.2;

        $("m2ValidationResult").classList.remove("hidden");

        $("m2ValidationResult").innerHTML = `
            <p class="font-bold mb-2">
                ${amplitudePass && phasePass ? "PASS" : "CHECK"}
                — Official validation reference
            </p>

            <p class="text-sm">
                Expected amplitude ratio: 0.93 |
                Calculated: ${result.magnitude.toFixed(3)}
                <strong>${amplitudePass ? "PASS" : "CHECK"}</strong>
            </p>

            <p class="text-sm mt-1">
                Expected phase lag: 21.8° |
                Calculated: ${phaseDegrees.toFixed(1)}°
                <strong>${phasePass ? "PASS" : "CHECK"}</strong>
            </p>

            <p class="text-xs lab-muted mt-2">
                Calculated using M = 1/√(1+(ωτ)²)
                and φ = −tan⁻¹(ωτ).
            </p>
        `;
    });

    // Prediction check
    $("m2CheckPrediction").addEventListener("click", () => {
        const choice = $("m2Prediction").value;
        const result = $("m2PredictionResult");

        result.classList.remove("hidden");

        if (!choice) {
            result.textContent = "Please choose a prediction first.";
            return;
        }

        const correct = choice === "decrease";

        result.innerHTML = correct
            ? "<strong>Correct!</strong> As ω increases, ωτ increases and M = 1/√(1+(ωτ)²) decreases."
            : "<strong>Not quite.</strong> The amplitude ratio decreases as frequency increases because the denominator √(1+(ωτ)²) becomes larger.";
    });

    // Initial display
    updateModule2();

    
// 100 Hz Dynamic Error Validation

const highFreqButton = document.getElementById("m2HighFreqValidate");
const highFreqResult = document.getElementById("m2HighFreqResult");

if (highFreqButton && highFreqResult) {
    highFreqButton.addEventListener("click", () => {
        const frequency = 100;
        const phaseFrequency = 50;
        const maxError = 0.05;

        const omega100 = 2 * Math.PI * frequency;
        const omega50 = 2 * Math.PI * phaseFrequency;

        const minAmplitudeRatio = 1 - maxError;

        const tauMax = Math.sqrt(1 / (minAmplitudeRatio ** 2) - 1) / omega100;

        const amplitudeRatio = 1 / Math.sqrt(1 + (omega100 * tauMax) ** 2);

        const dynamicError = (1 - amplitudeRatio) * 100;

        const phaseLag100 = -Math.atan(omega100 * tauMax) * (180 / Math.PI);

        const phaseLag50 = -Math.atan(omega50 * tauMax) * (180 / Math.PI);

        const tauMs = tauMax * 1000;

        const errorPass = dynamicError <= 5.001;
        const tauPass = Math.abs(tauMs - 0.523) < 0.002;
        const phasePass = Math.abs(Math.abs(phaseLag50) - 9.3) < 0.15;

        const allPass = errorPass && tauPass && phasePass;

        highFreqResult.classList.remove("hidden");

        highFreqResult.innerHTML = `
            <h4 class="font-bold text-lg mb-3">
                100 Hz Validation Results
            </h4>

            <p class="text-sm mb-2">
                Input Frequency:
                <strong>100 Hz</strong>
            </p>

            <p class="text-sm mb-2">
                Maximum Allowed Error:
                <strong>5%</strong>
            </p>

            <p class="text-sm mb-2">
                Maximum Time Constant:
                <strong>${tauMs.toFixed(3)} ms</strong>
                <strong>${tauPass ? "PASS" : "FAIL"}</strong>
            </p>

            <p class="text-sm mb-2">
                Amplitude Ratio:
                <strong>${amplitudeRatio.toFixed(4)}</strong>
            </p>

            <p class="text-sm mb-2">
                Dynamic Error:
                <strong>${dynamicError.toFixed(2)}%</strong>
                <strong>${errorPass ? "PASS" : "FAIL"}</strong>
            </p>

            <p class="text-sm mb-2">
                Phase Lag at 100 Hz:
                <strong>${Math.abs(phaseLag100).toFixed(2)}°</strong>
            </p>

            <hr class="my-4" style="border-color:var(--border)">

            <h4 class="font-bold text-lg mb-3">
                Phase Lag Verification – 50 Hz
            </h4>

            <p class="text-sm mb-2">
                Input Frequency:
                <strong>50 Hz</strong>
            </p>

            <p class="text-sm mb-2">
                Time Constant:
                <strong>${tauMs.toFixed(3)} ms</strong>
            </p>

            <p class="text-sm mb-2">
                Expected Phase Lag:
                <strong>-9.3°</strong>
            </p>

            <p class="text-sm mb-2">
                Calculated Phase Lag:
                <strong>${phaseLag50.toFixed(2)}°</strong>
                <strong>${phasePass ? "PASS" : "FAIL"}</strong>
            </p>

            <p class="font-bold mt-4"
                style="color:${allPass ? "#16a34a" : "#dc2626"};">
                ${allPass
                    ? "PASS ✓ — All validation requirements are satisfied."
                    : "FAIL ✗ — One or more validation requirements are not satisfied."}
            </p>
        `;
    });
}
window.Module2 = { calculate };

})();