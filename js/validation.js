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
    parameters.textContent = `K = ${K.toFixed(1)}, τ = ${tau.toFixed(1)} s, A = 1`;

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

    const desktopWrapper = document.createElement("div");
    desktopWrapper.className = "hidden sm:block overflow-x-auto";
    const table = document.createElement("table");
    table.className = "w-full text-left text-sm";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["Check", "Expected", "Actual", "Result"].forEach(label => {
        const th = document.createElement("th");
        th.textContent = label;
        th.className = "px-3 py-3 font-bold border-b border-[var(--border)]";
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
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
            td.className = "px-3 py-4 border-b border-[var(--border)]";

            if (index === 3) {
                td.className += test.passed? " font-bold text-green-600 dark:text-green-400" : " font-bold text-red-600 dark:text-red-400";
            }

            row.appendChild(td);
        });

        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    desktopWrapper.appendChild(table);

    const mobileWrapper = document.createElement("div");
    mobileWrapper.className = "sm:hidden space-y-3";
    tests.forEach((test, index) => {
        const card = document.createElement("div");
        card.className = "lab-panel rounded-2xl p-4 space-y-4";
        const cardHeading = document.createElement("div");
        cardHeading.className = "flex items-center justify-between gap-3";
        const testName = document.createElement("h5");
        testName.className = "text-xs sm:text-sm font-bold";
        testName.textContent = test.name;
        const testNumber = document.createElement("span");
        testNumber.className = "text-xs lab-muted";
        testNumber.textContent = `TEST 0${index + 1}`;

        cardHeading.append(testName, testNumber);
        const valuesGrid = document.createElement("div");
        valuesGrid.className = "grid grid-cols-2 gap-3";
        function makeValue(label, value) {
            const valueBox = document.createElement("div");
            valueBox.className = "min-w-0 space-y-2";
            const valueLabel = document.createElement("p");
            valueLabel.className = "text-xs lab-muted font-semibold";
            valueLabel.textContent = label;

            const valueText = document.createElement("p");
            valueText.className =  "font-mono text-[11px] sm:text-sm font-semibold tabular-nums whitespace-nowrap";
            valueText.textContent = value.toFixed(6);
            valueBox.append(valueLabel, valueText);
            return valueBox;
        }

        valuesGrid.append(
            makeValue("EXPECTED", test.expected),
            makeValue("ACTUAL", test.actual)
        );

        const result = document.createElement("p");

        result.className = test.passed
            ? "text-sm font-bold text-green-600 dark:text-green-400"
            : "text-sm font-bold text-red-600 dark:text-red-400";

        result.textContent = test.passed
            ? "✓ PASS"
            : "✕ FAIL";

        card.append(cardHeading, valuesGrid, result);
        mobileWrapper.appendChild(card);
    });

    validationResult.append(title,parameters,desktopWrapper, mobileWrapper );

});
