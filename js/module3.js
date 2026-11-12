
/*
 
 * Second-Order Response
 * Mass-Spring-Damper System
 * wn = sqrt(k/m)
 * zeta = b/(2*sqrt(m*k))
 */

(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const massSlider = $("m3Mass");
    const dampingSlider = $("m3Damping");
    const springSlider = $("m3Spring");

    if (!massSlider || !dampingSlider || !springSlider ||
        typeof Plotly === "undefined") return;

    const radToDeg = rad => rad * 180 / Math.PI;

    // Read project theme colors
    function getColors() {
        const css = getComputedStyle(document.documentElement);

        return {
            background: css.getPropertyValue("--surface-soft").trim(),
            text: css.getPropertyValue("--text").trim(),
            grid: css.getPropertyValue("--chart-grid").trim(),
            primary: css.getPropertyValue("--primary").trim(),
            accent: css.getPropertyValue("--accent").trim()
        };
    }

    // Calculate natural frequency and damping ratio
    function calculateParameters(m, b, k) {
        const wn = Math.sqrt(k / m);
        const zeta = b / (2 * Math.sqrt(m * k));

        return { wn, zeta };
    }

    // Calculate normalized unit-step response
    function stepResponse(t, wn, zeta) {

        if (Math.abs(zeta - 1) < 1e-8) {
            return 1 - (1 + wn * t) * Math.exp(-wn * t);
        }

        if (zeta < 1) {
            const wd = wn * Math.sqrt(1 - zeta * zeta);

            return 1 - Math.exp(-zeta * wn * t) *
                (
                    Math.cos(wd * t) +
                    (zeta / Math.sqrt(1 - zeta * zeta)) *
                    Math.sin(wd * t)
                );
        }

        const root = Math.sqrt(zeta * zeta - 1);

        const p1 = -wn * (zeta - root);
        const p2 = -wn * (zeta + root);

        const error =
            (p2 * Math.exp(p1 * t) -
             p1 * Math.exp(p2 * t)) / (p2 - p1);

        return 1 - error;
    }

    // Calculate system poles
    function calculatePoles(wn, zeta) {

        if (zeta < 1) {
            const real = -zeta * wn;
            const imaginary = wn * Math.sqrt(1 - zeta * zeta);

            return [
                { real, imaginary },
                { real, imaginary: -imaginary }
            ];
        }

        if (Math.abs(zeta - 1) < 1e-8) {
            return [
                { real: -wn, imaginary: 0 },
                { real: -wn, imaginary: 0 }
            ];
        }

        const root = Math.sqrt(zeta * zeta - 1);

        return [
            { real: -wn * (zeta - root), imaginary: 0 },
            { real: -wn * (zeta + root), imaginary: 0 }
        ];
    }

    // Eigenvalues 
    function calculateEigenvalues(m, b, k) {
        const a11 = 0, a12 = 1;
        const a21 = -k / m, a22 = -b / m;
        const trace = a11 + a22;
        const det = a11 * a22 - a12 * a21;
        const disc = trace * trace - 4 * det;
        if (disc >= 0) {
            const root = Math.sqrt(disc) / 2;
            return [
                { real: trace / 2 + root, imaginary: 0 },
                { real: trace / 2 - root, imaginary: 0 }
            ];
        }
        const imaginary = Math.sqrt(-disc) / 2;
        return [
            { real: trace / 2, imaginary },
            { real: trace / 2, imaginary: -imaginary }
        ];
    }

    // Find response characteristics from sampled curve
    function calculateMetrics(time, response, wn, zeta) {

        const peak = Math.max(...response);
        const peakIndex = response.indexOf(peak);

        const overshoot = Math.max(0, (peak - 1) * 100);

        const peakTime = zeta < 1
            ? Math.PI / (wn * Math.sqrt(1 - zeta * zeta))
            : null;

        function crossing(level) {
            const index = response.findIndex(v => v >= level);

            if (index < 0) return null;
            if (index === 0) return time[0];

            const fraction =
                (level - response[index - 1]) /
                (response[index] - response[index - 1]);

            return time[index - 1] +
                fraction * (time[index] - time[index - 1]);
        }

        const t10 = crossing(0.1);
        const t90 = crossing(0.9);

        const riseTime =
            t10 !== null && t90 !== null ? t90 - t10 : null;

        let lastOutside = -1;

        response.forEach((value, i) => {
            if (Math.abs(value - 1) > 0.02) {
                lastOutside = i;
            }
        });

        const settlingTime =
            lastOutside >= 0 && lastOutside < time.length - 1
                ? time[lastOutside + 1]
                : null;

        return {
            peak,
            peakIndex,
            overshoot,
            peakTime,
            riseTime,
            settlingTime
        };
    }

    // RK4 state-space integration 
    function simulateStateSpace(m, b, k, endTime) {
        const samples = 1200;
        const sampleDt = endTime / samples;
        const { wn, zeta } = calculateParameters(m, b, k);
        const fastestPole = Math.max(...calculatePoles(wn, zeta).map(
            pole => Math.hypot(pole.real, pole.imaginary)
        ));
        const substeps = Math.max(1, Math.ceil(sampleDt * fastestPole / 0.25));
        const dt = sampleDt / substeps;
        const time = [], displacement = [], velocity = [];
        let x1 = 0, x2 = 0;
        const force = k;
        function derivatives(a, v) {
            return { dx1: v, dx2: (force - b * v - k * a) / m };
        }
        for (let i = 0; i <= samples; i++) {
            time.push(i * sampleDt);
            displacement.push(x1);
            velocity.push(x2);
            if (i === samples) break;
            for (let j = 0; j < substeps; j++) {
                const a = derivatives(x1, x2);
                const b1 = derivatives(x1 + a.dx1 * dt / 2, x2 + a.dx2 * dt / 2);
                const c = derivatives(x1 + b1.dx1 * dt / 2, x2 + b1.dx2 * dt / 2);
                const d = derivatives(x1 + c.dx1 * dt, x2 + c.dx2 * dt);
                x1 += dt / 6 * (a.dx1 + 2 * b1.dx1 + 2 * c.dx1 + d.dx1);
                x2 += dt / 6 * (a.dx2 + 2 * b1.dx2 + 2 * c.dx2 + d.dx2);
            }
        }
        return { time, displacement, velocity };
    }

    // Update the main response plot
    function drawResponse(time, response, c) {

        Plotly.react("m3ResponsePlot", [
            {
                x: time,
                y: response,
                type: "scatter",
                mode: "lines",
                name: "Step Response",
                line: { color: c.primary, width: 3 }
            },
            {
                x: [time[0], time[time.length - 1]],
                y: [1, 1],
                type: "scatter",
                mode: "lines",
                name: "Final Value",
                line: { color: c.accent, dash: "dash", width: 2 }
            }
        ], {
            paper_bgcolor: c.background,
            plot_bgcolor: c.background,
            font: { color: c.text },
            margin: { l: 60, r: 20, t: 25, b: 55 },
            xaxis: {
                title: "Time (s)",
                gridcolor: c.grid
            },
            yaxis: {
                title: "Normalized Output",
                gridcolor: c.grid
            },
            legend: { orientation: "h", x: 0, y: 1.15 }
        }, {
            responsive: true,
            displaylogo: false
        });
    }

    // Draw poles in the complex plane
    function drawPoles(poles, c) {

        const real = poles.map(p => p.real);
        const imaginary = poles.map(p => p.imaginary);

        const extent = Math.max(
            1,
            ...real.map(Math.abs),
            ...imaginary.map(Math.abs)
        ) * 1.25;

        Plotly.react("m3PolePlot", [{
            x: real,
            y: imaginary,
            type: "scatter",
            mode: "markers",
            name: "System Poles",
            marker: {
                color: c.accent,
                size: 14,
                symbol: "x",
                line: { width: 2 }
            },
            text: poles.map(p =>
                `${p.real.toFixed(3)} ${p.imaginary >= 0 ? "+" : "-"} j${Math.abs(p.imaginary).toFixed(3)}`
            ),
            hovertemplate: "%{text}<extra></extra>"
        }], {
            paper_bgcolor: c.background,
            plot_bgcolor: c.background,
            font: { color: c.text },
            margin: { l: 60, r: 20, t: 20, b: 55 },
            xaxis: {
                title: "Real Axis",
                gridcolor: c.grid,
                zeroline: true,
                range: [-extent, extent]
            },
            yaxis: {
                title: "Imaginary Axis",
                gridcolor: c.grid,
                zeroline: true,
                range: [-extent, extent]
            },
            showlegend: false
        }, {
            responsive: true,
            displaylogo: false
        });
    }

    // Draw phase plane
    function drawPhasePlane(simulation, c) {

        Plotly.react("m3PhasePlot", [{
            x: simulation.displacement,
            y: simulation.velocity,
            type: "scatter",
            mode: "lines",
            name: "System Trajectory",
            line: { color: c.primary, width: 3 }
        }], {
            paper_bgcolor: c.background,
            plot_bgcolor: c.background,
            font: { color: c.text },
            margin: { l: 60, r: 20, t: 20, b: 55 },
            xaxis: {
                title: "Displacement x1",
                gridcolor: c.grid
            },
            yaxis: {
                title: "Velocity x2",
                gridcolor: c.grid
            },
            showlegend: false
        }, {
            responsive: true,
            displaylogo: false
        });
    }

    // Main update function
    function updateModule3() {

        const m = Number(massSlider.value);
        const b = Number(dampingSlider.value);
        const k = Number(springSlider.value);

        const { wn, zeta } = calculateParameters(m, b, k);

        const c = getColors();

        // Damping classification
        let classification;

        if (zeta < 1 - 1e-8) {
            classification = "Underdamped";
        } else if (zeta > 1 + 1e-8) {
            classification = "Overdamped";
        } else {
            classification = "Critically Damped";
        }

        // Update labels
        $("m3MassValue").textContent = m.toFixed(1) + " kg";
        $("m3DampingValue").textContent = b.toFixed(1) + " Ns/m";
        $("m3SpringValue").textContent = k.toFixed(1) + " N/m";

        $("m3Wn").textContent = wn.toFixed(3);
        $("m3Zeta").textContent = zeta.toFixed(3);
        $("m3Classification").textContent = classification;

        
        const slowRate = zeta > 1
            ? wn / (zeta + Math.sqrt(zeta * zeta - 1))
            : zeta * wn;
        const estimatedDuration = slowRate > 0
            ? 8 / slowRate
            : 8 * Math.PI / wn;
        const endTime = Math.min(120, Math.max(5, estimatedDuration));

        const time = [];
        const response = [];

        for (let i = 0; i <= 1000; i++) {
            const t = endTime * i / 1000;

            time.push(t);
            response.push(stepResponse(t, wn, zeta));
        }

        const metrics = calculateMetrics(time, response, wn, zeta);

        $("m3Overshoot").textContent =
            metrics.overshoot.toFixed(2) + "%";

        $("m3PeakTime").textContent =
            metrics.peakTime === null
                ? "No peak"
                : metrics.peakTime.toFixed(3) + " s";

        $("m3RiseTime").textContent =
            metrics.riseTime === null
                ? "--"
                : metrics.riseTime.toFixed(3) + " s";

        $("m3Settling").textContent =
            metrics.settlingTime === null
                ? `Not within ${endTime.toFixed(1)} s`
                : metrics.settlingTime.toFixed(3) + " s";

        // Response plot
        drawResponse(time, response, c);

        // Poles and eigenvalues
        const poles = calculatePoles(wn, zeta);

        drawPoles(poles, c);

        $("m3Poles").textContent = poles.map(p =>
            `${p.real.toFixed(3)} ${p.imaginary >= 0 ? "+" : "-"} j${Math.abs(p.imaginary).toFixed(3)}`
        ).join("   ,   ");

        // State-space matrices
        $("m3MatrixA").innerHTML =
            `⎡ 0 &nbsp;&nbsp; 1 ⎤<br>` +
            `⎣ ${(-k/m).toFixed(3)} &nbsp; ${(-b/m).toFixed(3)} ⎦`;

        $("m3MatrixB").innerHTML =
            `⎡ 0 ⎤<br>⎣ ${(1/m).toFixed(3)} ⎦`;

        $("m3Eigenvalues").textContent = calculateEigenvalues(m, b, k).map(p =>
            `${p.real.toFixed(3)} ${p.imaginary >= 0 ? "+" : "-"} j${Math.abs(p.imaginary).toFixed(3)}`
        ).join("   ,   ");

        // State-space simulation
        const simulation = simulateStateSpace(m, b, k, endTime);

        drawPhasePlane(simulation, c);
    }

    // Slider listeners
    massSlider.addEventListener("input", updateModule3);
    dampingSlider.addEventListener("input", updateModule3);
    springSlider.addEventListener("input", updateModule3);

    // Theme listener
    window.addEventListener("transient-theme-change", updateModule3);

    // Reset parameters
    $("m3Reset").addEventListener("click", () => {
        massSlider.value = 1;
        dampingSlider.value = 2;
        springSlider.value = 4;

        updateModule3();
    });

    // Prediction
    $("m3CheckPrediction").addEventListener("click", () => {

        const choice = $("m3Prediction").value;
        const result = $("m3PredictionResult");

        result.classList.remove("hidden");

        if (!choice) {
            result.textContent = "Please select your prediction first.";
            return;
        }

        result.innerHTML = choice === "less"
            ? "<strong>Correct!</strong> Increasing damping reduces oscillations and overshoot. When damping becomes sufficiently large, the response becomes overdamped."
            : "<strong>Not quite!</strong> Increasing damping reduces oscillations. Try again after observing how ζ changes.";
    });

    // Validation checks 4, 5 and 6
    $("m3Validate").addEventListener("click", () => {

        
        function sampledOvershoot(wn, zeta) {
            const endTime = 8 / (zeta * wn);
            let peak = -Infinity;
            for (let i = 0; i <= 4000; i++) {
                const t = i * endTime / 4000;
                peak = Math.max(peak, stepResponse(t, wn, zeta));
            }
            return Math.max(0, (peak - 1) * 100);
        }
        const under = calculateParameters(1, 2, 4);       // zeta=0.5, wn=2
        const critical = calculateParameters(1, 4, 4);    // zeta=1, wn=2
        const overshoot05 = sampledOvershoot(under.wn, under.zeta);
        const overshoot1 = sampledOvershoot(critical.wn, critical.zeta);
        const poles = calculatePoles(under.wn, under.zeta);
        const eigenvalues = calculateEigenvalues(1, 2, 4);
        const close = (x, y, tol = 1e-3) => Math.abs(x - y) <= tol;
        const rootsMatch = poles.every((p, i) =>
            close(p.real, eigenvalues[i].real) &&
            close(p.imaginary, eigenvalues[i].imaginary)
        );
        const pass1 = close(overshoot05, 16.3, 0.1);
        const pass2 = close(overshoot1, 0, 1e-3) &&
            close(stepResponse(0, critical.wn, critical.zeta), 0) &&
            stepResponse(8 / critical.wn, critical.wn, critical.zeta) > 0.99;
        const pass3 = close(under.wn, 2) && close(under.zeta, 0.5) &&
            close(eigenvalues[0].real, -1) &&
            close(eigenvalues[0].imaginary, 1.73205) &&
            close(eigenvalues[1].real, -1) &&
            close(eigenvalues[1].imaginary, -1.73205) && rootsMatch;
        const tests = [
            { title: "Test 4: ζ = 0.5", expected: "16.3%",
              actual: overshoot05.toFixed(2) + "%", pass: pass1 },
            { title: "Test 5: ζ = 1", expected: "0%",
              actual: overshoot1.toFixed(2) + "%", pass: pass2 },
            { title: "Test 6: State-Space Eigenvalues",
              expected: "−1 ± j1.732 (matches poles)",
              actual: `${eigenvalues[0].real.toFixed(3)} ± j${Math.abs(eigenvalues[0].imaginary).toFixed(3)}; ` +
                      (rootsMatch ? "matches poles" : "does not match poles"),
              pass: pass3 }
        ];

        const output = $("m3ValidationResult");

        output.classList.remove("hidden");

        output.innerHTML = `
            <h4 class="font-bold text-lg mb-4">
                Validation Results
            </h4>
            ${tests.map(test => `
                <div class="border-b py-3" style="border-color:var(--border)">
                    <p class="font-bold">${test.title}</p>
                    <p class="text-sm mt-1">
                        Expected: ${test.expected}
                    </p>
                    <p class="text-sm">
                        Calculated: ${test.actual}
                    </p>
                    <p class="font-bold mt-1"
                        style="color:${test.pass ? "#16a34a" : "#dc2626"}">
                        ${test.pass ? "PASS ✓" : "FAIL ✗"}
                    </p>
                </div>
            `).join("")}
        `;
    });
    window.Module3 = {
    stepResponse,
    calculateParameters,
    calculatePoles,
    calculateMetrics
    };
    // Initial simulation
    updateModule3();

})();
