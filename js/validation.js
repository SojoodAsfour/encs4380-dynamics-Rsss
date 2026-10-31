const runValidation = document.getElementById("runValidation");
const validationResult = document.getElementById("validationResult");
runValidation.addEventListener("click", () => {
    const K = Number(document.getElementById("gain").value);
    const tau = Number(document.getElementById("tau").value);
    const A = 1;
    const finalValue = K * A;
    const expectedTau = 0.632 * finalValue;
    const expected3Tau = 0.95 * finalValue;
    const actualTau = stepResponse(tau, K, tau);
    const actual3Tau = stepResponse(3 * tau, K, tau);
    const tolerance = 0.001 * finalValue;

    const passTau = Math.abs(actualTau - expectedTau) <= tolerance;
    const pass3Tau = Math.abs(actual3Tau - expected3Tau) <= tolerance;
    validationResult.replaceChildren();
    validationResult.classList.remove("hidden");
    const title = document.createElement("h4");
    title.className = "font-bold mb-3";
    title.textContent = "Official Validation Check #1 — First-Order Step";
    const parameters = document.createElement("p");
    parameters.className = "lab-muted text-sm mb-4";
    parameters.textContent =`K = ${K.toFixed(1)}, τ = ${tau.toFixed(1)} s, A = 1`;
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.textAlign = "left";
    const header = document.createElement("tr");
    ["Check", "Expected", "Actual", "Result"].forEach(text => {
        const th = document.createElement("th");
        th.textContent = text;
        th.style.padding = "10px";
        header.appendChild(th);
    });
    table.appendChild(header);
    const tests = [
        {
            name: "y(τ) = 63.2% KA",
            expected: expectedTau,
            actual: actualTau,
            passed: passTau
        },
        {
            name: "y(3τ) = 95% KA",
            expected: expected3Tau,
            actual: actual3Tau,
            passed: pass3Tau
        }
    ];

    tests.forEach(test => {
        const row = document.createElement("tr");

        [
            test.name,
            test.expected.toFixed(6),
            test.actual.toFixed(6),
            test.passed ? "PASS" : "FAIL"
        ].forEach((value, index) => {
            const td = document.createElement("td");
            td.textContent = value;
            td.style.padding = "10px";
            td.style.borderTop = "1px solid var(--border)";

            if (index === 3) {
                td.style.fontWeight = "bold";
                td.style.color = test.passed
                    ? "#16834a"
                    : "#c0392b";
            }

            row.appendChild(td);
        });
        table.appendChild(row);
    });

    const wrapper = document.createElement("div");
    wrapper.style.overflowX = "auto";
    wrapper.appendChild(table);
    validationResult.append(
        title,
        parameters,
        wrapper
    );
});
