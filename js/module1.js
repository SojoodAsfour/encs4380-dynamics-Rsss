/*
 * Step response:
 * y(t) = K * A * (1 - exp(-t / tau))
 */

const gainSlider = document.getElementById("gain");
const tauSlider = document.getElementById("tau");
const inputType = document.getElementById("inputType");
const gainValue = document.getElementById("gainValue");
const tauValue = document.getElementById("tauValue");
const resultTau = document.getElementById("resultTau");
const result63 = document.getElementById("result63");
const result95 = document.getElementById("result95");

const A = 1;

// Calculate first-order step response
function stepResponse(t, K, tau) {
    return K * A * (1 - Math.exp(-t / tau));
}


const R = 1;

// First-order ramp response for zero initial conditions
function rampResponse(t, K, tau) {
    return K * R * (
        t - tau * (1 - Math.exp(-t / tau))
    );
}


// Read current CSS theme colors
function getChartColors() {
    const styles = getComputedStyle(document.documentElement);

    return {
        background: styles.getPropertyValue("--surface-soft").trim(),
        text: styles.getPropertyValue("--text").trim(),
        grid: styles.getPropertyValue("--chart-grid").trim(),
        primary: styles.getPropertyValue("--primary").trim(),
        accent: styles.getPropertyValue("--accent").trim()
    };
}

// Draw and update the response
function updateModule1() {

    const K = Number(gainSlider.value);
    const tau = Number(tauSlider.value);
    const type = inputType.value;

    const inputEquation = document.getElementById("inputEquation");
    const responseEquation = document.getElementById("responseEquation");

    if (type === "step") {
        inputEquation.textContent = "x(t) = A";
        responseEquation.textContent = "y(t) = KA(1 − e^(−t/τ))";
    } else {
        inputEquation.textContent = "x(t) = Rt";
        responseEquation.textContent = "y(t) = KR[t − τ(1 − e^(−t/τ))]";
    }


    // Update slider labels
    gainValue.textContent = K.toFixed(1);
    tauValue.textContent = tau.toFixed(1) + " s";

    // Generate time and output arrays
    const time = [];
    const output = [];
    const input = [];

    const maxTime = Math.max(30, 6 * tau);
    const points = 200;

    for (let i = 0; i <= points; i++) {
        const t = (i / points) * maxTime;

        time.push(t);

        input.push(type === "step" ? K * A : K * R * t);


        if (type === "step") {
            output.push(stepResponse(t, K, tau));
        } else {
            output.push(rampResponse(t, K, tau));
        }

    }

    // Calculate Response values at tau and 3*tau
    const yTau = stepResponse(tau, K, tau);
    const y3Tau = stepResponse(3 * tau, K, tau);
    const finalValue = K * A;
    const percentTau = (yTau / finalValue) * 100;
    const percent3Tau = (y3Tau / finalValue) * 100;


    // Update result cards
    resultTau.textContent = tau.toFixed(1) + " s";

    if (type === "step") {
        // Step response results
        result63.parentElement.querySelector("p").textContent = "Response at τ";
        result95.parentElement.querySelector("p").textContent = "Response at 3τ";
        result63.textContent = percentTau.toFixed(1) + "%";
        result95.textContent = percent3Tau.toFixed(1) + "%";

    } else {
        // Ramp response results
        const timeLag = tau;
        const steadyStateError = K * R * tau;
        result63.parentElement.querySelector("p").textContent = "Ramp Time Lag";
        result95.parentElement.querySelector("p").textContent = "Steady-State Error";
        result63.textContent = timeLag.toFixed(1) + " s";
        result95.textContent = steadyStateError.toFixed(2);
    }


    const colors = getChartColors();

    // Main response curve
    const responseTrace = {
        x: time,
        y: output,
        type: "scatter",
        mode: "lines",
        name: type === "step" ? "Step Response" : "Ramp Response",
        line: {
            color: colors.primary,
            width: 4
        },
        hovertemplate:
            "Time: %{x:.2f} s" +
            "<br>Output: %{y:.4f}<extra></extra>"
    };


    const idealTrace = {
        x: time,
        y: input,
        type: "scatter",
        mode: "lines",
        name: "Ideal Output (Kx)",
        line: {
            color: colors.accent,
            width: 2.5,
            dash: "dash"
        }
    };


    // 63.2% and 95% markers
    const markerTrace = {
        x: [tau, 3 * tau],
        y: [yTau, y3Tau],
        type: "scatter",
        mode: "markers+text",
        name: "Reference Points",
        text: ["63.2%", "95.0%"],
        textposition: "top center",
        textfont: {
            color: colors.text,
            size: 12
        },
        marker: {
            color: colors.accent,
            size: 11,
            line: {
                color: colors.background,
                width: 2
            }
        },
        hovertemplate:
            "Time: %{x:.2f} s" +
            "<br>Output: %{y:.4f}<extra></extra>"
    };

    // Chart layout
    const layout = {
        paper_bgcolor: colors.background,
        plot_bgcolor: colors.background,
        font: {
            color: colors.text,
            family: "Arial, sans-serif"
        },
        margin: {
            l: 60,
            r: 20,
            t: 35,
            b: 60
        },
        xaxis: {
            title: { text: "Time (s)" },
            gridcolor: colors.grid,
            zeroline: false,
            range: [0, maxTime]
        },
        yaxis: {
            title: { text: "Sensor Output y(t)" },
            gridcolor: colors.grid,
            zeroline: false,
            range: [0, type === "step" ? finalValue * 1.2 : K * R * maxTime * 1.1]
        },
        showlegend: true,
        legend: {
            orientation: "h",
            x: 0,
            y: 1.15
        }
    };

    const config = {
        responsive: true,
        displaylogo: false
    };


    const errorSection = document.getElementById("errorSection");
    const errorSlope = document.getElementById("errorSlope");

    if (type === "step") {

        errorSection.style.display = "block";
        const slope = -1 / tau;
        errorSlope.textContent = slope.toFixed(3) + " s⁻¹";
        const errorTime = [];
        const errorFraction = [];

        // Generate error values from t = 0 to 5*tau
        for (let i = 0; i <= 200; i++) {

            const t = (i / 200) * (5 * tau);
            // E(t) = exp(-t/tau)
            const error = Math.exp(-t / tau);
            errorTime.push(t);
            errorFraction.push(error);
        }

        const errorTrace = {
            x: errorTime,
            y: errorFraction,
            type: "scatter",
            mode: "lines",
            name: "Error Fraction",
            line: {
                color: colors.accent,
                width: 3
            },
            hovertemplate:
                "Time: %{x:.2f} s" +
                "<br>Error: %{y:.5f}<extra></extra>"
        };

        const errorLayout = {
            paper_bgcolor: colors.background,
            plot_bgcolor: colors.background,

            font: {
                color: colors.text
            },

            margin: {
                l: 75, r: 25, t: 30, b: 65
            },

            xaxis: {
                title: { text: "Time (s)" },
                gridcolor: colors.grid,
                zeroline: false
            },

            yaxis: {
                title: { text: "Error Fraction E(t)" },
                type: "log",
                gridcolor: colors.grid,
                range: [-2.3, 0.1],
                tickmode: "array",
                tickvals: [0.01, 0.1, 1],
                ticktext: ["0.01", "0.1", "1"]
            },

            showlegend: false
        };

        Plotly.react(
            "errorPlot",
            [errorTrace],
            errorLayout,
            {
                responsive: true,
                displaylogo: false
            }
        );

    } else {
        // Error fraction analysis is specific to step response
        errorSection.style.display = "none";
    }


    // Draw or redraw the plot

    const traces = type === "step" ? [responseTrace, markerTrace] : [idealTrace, responseTrace];

    Plotly.react(
        "responsePlot",
        traces,
        layout,
        config
    );

}

// Update when slider values change
gainSlider.addEventListener("input", updateModule1);
tauSlider.addEventListener("input", updateModule1);

// Update when input selection changes
inputType.addEventListener("change", updateModule1);

// Reapply chart colors when theme changes
window.addEventListener(
    "transient-theme-change",
    updateModule1
);

// Draw the initial plot
updateModule1();
