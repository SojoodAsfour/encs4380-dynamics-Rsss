const predictionQuestion = document.getElementById("predictionQuestion");
const predictionType = document.getElementById("predictionType");
const checkPrediction = document.getElementById("checkPrediction");
const newPrediction = document.getElementById("newPrediction");
const predictionResult = document.getElementById("predictionResult");
const predictionChartSection = document.getElementById("predictionChartSection");
const signalSelector = document.getElementById("inputType");

const predictionA = 1;
const predictionR = 1;

const stepQuestions = [
    {
        question: "What happens when τ increases while K stays constant?",
        options: [
            "The response becomes faster",
            "The response becomes slower",
            "The final value increases"
        ],
        correct: 1,
        parameter: "tau",
        factor: 1.5,
        explanation:
            "Increasing τ makes the step response slower. " +
            "The final value KA remains unchanged."
    },
    {
        question: "What happens when τ decreases while K stays constant?",
        options: [
            "The response becomes faster",
            "The response becomes slower",
            "The final value decreases"
        ],
        correct: 0,
        parameter: "tau",
        factor: 0.7,
        explanation:
            "A smaller τ makes the response reach its " +
            "final value faster."
    },
    {
        question: "What happens when K increases while τ stays constant?",
        options: [
            "The time constant increases",
            "The final output increases",
            "The response becomes slower"
        ],
        correct: 1,
        parameter: "K",
        factor: 1.5,
        explanation:
            "For a unit step, the final output is K. " +
            "Increasing K raises the final output, not τ."
    },
    {
        question: "What happens when K decreases while τ stays constant?",
        options: [
            "The final output decreases",
            "The response becomes faster",
            "The time constant decreases"
        ],
        correct: 0,
        parameter: "K",
        factor: 0.7,
        explanation:
            "Decreasing K lowers the final step output. " +
            "The time constant remains unchanged."
    }
];

const rampQuestions = [
    {
        question: "What happens to ramp time lag when τ increases?",
        options: [
            "Time lag decreases",
            "Time lag increases",
            "Time lag becomes zero"
        ],
        correct: 1,
        parameter: "tau",
        factor: 1.5,
        explanation:
            "For a first-order ramp response, the " +
            "asymptotic time lag equals τ."
    },
    {
        question: "What happens to the asymptotic ramp error relative to the ideal output KRt when τ decreases?",
        options: [
            "The error increases",
            "The error stays the same",
            "The error decreases"
        ],
        correct: 2,
        parameter: "tau",
        factor: 0.7,
        explanation:
            "Ramp steady-state error is KRτ. " +
            "Reducing τ reduces this error."
    },
    {
        question: "What happens to the asymptotic ramp error relative to the ideal output KRt when K increases?",
        options: [
            "The error increases",
            "The error decreases",
            "The error becomes zero"
        ],
        correct: 0,
        parameter: "K",
        factor: 1.5,
        explanation:
            "Since the steady-state error is KRτ, " +
            "increasing K increases the error."
    },
    {
        question: "What happens to ramp output when K decreases?",
        options: [
            "The output increases",
            "The output decreases",
            "The time constant becomes zero"
        ],
        correct: 1,
        parameter: "K",
        factor: 0.7,
        explanation:
            "K multiplies the ramp response. " +
            "Decreasing K reduces its output."
    }
];

let currentQuestion = null;
let remainingQuestions = [];
let lastQuestionIndex = -1;
let lastSignalType = null;
let lastComparison = null;

function shuffleIndices(length) {
    const indices = Array.from(
        { length },
        (_, i) => i
    );

    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    if (indices.length > 1 && indices[indices.length - 1] === lastQuestionIndex) {
        [indices[0], indices[indices.length - 1]] = [indices[indices.length - 1], indices[0]];
    }

    return indices;
}

function hidePredictionResult() {
    predictionResult.classList.add("hidden");
    predictionChartSection.classList.add("hidden");
    lastComparison = null;
}

function showNewQuestion() {
    const signalType = signalSelector.value;
    const bank = signalType === "step" ? stepQuestions : rampQuestions;

    if (signalType !== lastSignalType) {
        remainingQuestions = [];
        lastQuestionIndex = -1;
        lastSignalType = signalType;
    }

    if (remainingQuestions.length === 0) {
        remainingQuestions = shuffleIndices(bank.length);
    }

    const index = remainingQuestions.pop();
    lastQuestionIndex = index;
    currentQuestion = bank[index];
    predictionQuestion.textContent = currentQuestion.question;
    predictionType.replaceChildren();
    const placeholder = new Option("Choose your prediction", "");

    placeholder.disabled = true;
    placeholder.selected = true;
    predictionType.add(placeholder);
    currentQuestion.options.forEach((option, i) => {
        predictionType.add(new Option(option, String(i)));
    });

    hidePredictionResult();
}

function predictionStep(t, K, tau) {
    return K * predictionA * (1 - Math.exp(-t / tau));
}

function predictionRamp(t, K, tau) {
    return K * predictionR * (t - tau * (1 - Math.exp(-t / tau)));
}

function drawComparison(comparison) {
    const { signalType, K, tau, newK, newTau } =comparison;
    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue("--primary").trim();
    const accent =styles.getPropertyValue("--accent").trim();
    const background =styles.getPropertyValue("--surface-soft").trim();
    const text =styles.getPropertyValue("--text").trim();
    const grid = styles.getPropertyValue("--border").trim();

    const time = [];
    const original = [];
    const modified = [];
    const ideal = [];

    const maxTime = Math.max(30, 6 * Math.max(tau, newTau));

    for (let i = 0; i <= 200; i++) {
        const t = (i / 200) * maxTime;
        time.push(t);

        if (signalType === "step") {
            original.push(predictionStep(t, K, tau));
            modified.push(predictionStep(t, newK, newTau));
        } else {
            original.push(predictionRamp(t, K, tau));
            modified.push(predictionRamp(t, newK, newTau));
            ideal.push(K * predictionR * t);
        }
    }

    const traces = [
        {
            x: time,
            y: original,
            type: "scatter",
            mode: "lines",
            name: "Original Response",
            line: { color: primary, width: 3 }
        },
        {
            x: time,
            y: modified,
            type: "scatter",
            mode: "lines",
            name: "Modified Response",
            line: { color: accent, width: 3, dash: "dash" }
        }
    ];

    if (signalType === "ramp") {
        traces.push({
            x: time,
            y: ideal,
            type: "scatter",
            mode: "lines",
            name: "Original Ideal Output",
            line: {
                color: text,
                width: 1.5,
                dash: "dot"
            }
        });
    }

    const layout = {
        paper_bgcolor: background,
        plot_bgcolor: background,
        font: { color: text },
        margin: { l: 65, r: 20, t: 25, b: 80 },
        xaxis: {
            title: { text: "Time (s)" },
            gridcolor: grid,
            zeroline: false
        },
        yaxis: {
            title: { text: "Output y(t)" },
            gridcolor: grid,
            zeroline: false,
            rangemode: "tozero"
        },
        legend: {
            orientation: "h",
            x: 0,
            y: -0.3
        },
        showlegend: true
    };

    Plotly.react(
        "predictionPlot",
        traces,
        layout,
        {
            responsive: true,
            displaylogo: false
        }
    );
}

function checkAnswer() {
    if (predictionType.value === "") {
        predictionResult.textContent ="Please choose your prediction first.";
        predictionResult.classList.remove("hidden");
        predictionChartSection.classList.add("hidden");
        return;
    }

    const selected = Number(predictionType.value);
    const isCorrect = selected === currentQuestion.correct;
    const K = Number( document.getElementById("gain").value);
    const tau = Number(document.getElementById("tau").value);

    let newK = K;
    let newTau = tau;

    if (currentQuestion.parameter === "K") {
        newK = K * currentQuestion.factor;
    } else {
        newTau = tau * currentQuestion.factor;
    }

    const signalType = signalSelector.value;

    const comparison = {
        signalType,
        K,
        tau,
        newK,
        newTau
    };

    predictionResult.replaceChildren();

    const heading = document.createElement("h4");
    heading.className = "font-bold mb-2";
    heading.textContent = isCorrect ? "Correct prediction!": "Not quite — let's check the actual response.";

    const explanation = document.createElement("p");
    explanation.className = "text-sm lab-muted";
    explanation.textContent =currentQuestion.explanation;

    const values = document.createElement("p");
    values.className = "text-sm font-semibold mt-3";

    if (currentQuestion.parameter === "K") {
        values.textContent = `K: ${K.toFixed(2)} → ${newK.toFixed(2)} ` + `(τ = ${tau.toFixed(2)} s)`;
    } else {
        values.textContent =
            `τ: ${tau.toFixed(2)} s → ` +
            `${newTau.toFixed(2)} s ` +
            `(K = ${K.toFixed(2)})`;
    }

    const metrics = document.createElement("p");
    metrics.className = "text-sm lab-muted mt-2";

    if (signalType === "step") {
        metrics.textContent =
            `Final output: ${K.toFixed(3)} → ` +
            `${newK.toFixed(3)} | ` +
            `63.2% time: ${tau.toFixed(2)} s → ` +
            `${newTau.toFixed(2)} s`;
    } else {
        const oldError = K * predictionR * tau;
        const newError = newK * predictionR * newTau;

        metrics.textContent =
            `Ramp time lag: ${tau.toFixed(2)} s → ` +
            `${newTau.toFixed(2)} s | ` +
            `Steady-state error: ${oldError.toFixed(3)} → ` +
            `${newError.toFixed(3)}`;
    }

    predictionResult.append(heading, explanation, values, metrics);
    predictionResult.classList.remove("hidden");
    predictionChartSection.classList.remove("hidden");
    lastComparison = comparison;
    drawComparison(comparison);
}

checkPrediction.addEventListener("click", checkAnswer);
newPrediction.addEventListener( "click", showNewQuestion);
signalSelector.addEventListener("change", showNewQuestion);
document.getElementById("gain").addEventListener( "input", hidePredictionResult);
document.getElementById("tau").addEventListener("input", hidePredictionResult);

window.addEventListener("transient-theme-change",() => {
        if (lastComparison) {
            drawComparison(lastComparison);
        }
    }
);

showNewQuestion();
