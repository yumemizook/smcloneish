(function () {
    console.log("--- Accuracy Logic Debugger ---");
    const diff = window.userConfig ? (window.userConfig.judgeDifficulty || 4) : 4;
    console.log(`Current Judge Difficulty: ${diff}`);

    // Helper to get window
    // Ensure getTimingWindow is available
    if (typeof getTimingWindow !== 'function') {
        console.error("getTimingWindow is not defined. Load game.js first.");
        return;
    }

    const getW = (n) => getTimingWindow(n, diff);
    const windows = {
        marv: getW('marvelous'),
        perf: getW('perfect'),
        great: getW('great'),
        good: getW('good'),
        bad: getW('bad')
    };
    console.log("Timing Windows (ms):", windows);

    // Simulate offsets from 0 to 200ms
    const offsets = [];
    for (let i = 0; i <= 200; i += 10) offsets.push(i);
    // Add critical boundaries
    [windows.marv, windows.perf, windows.great, windows.good, windows.bad].forEach(w => {
        if (!offsets.includes(w)) offsets.push(w);
        if (!offsets.includes(w + 0.1)) offsets.push(w + 0.1);
    });
    offsets.sort((a, b) => a - b);

    const results = [];

    offsets.forEach(ms => {
        let pts = -8;
        let judge = "MISS";
        if (ms <= windows.marv) { pts = 3; judge = "MARV"; }
        else if (ms <= windows.perf) { pts = 2; judge = "PERF"; }
        else if (ms <= windows.great) { pts = 1; judge = "GREAT"; }
        else if (ms <= windows.good) { pts = 0; judge = "GOOD"; }
        else if (ms <= windows.bad) { pts = -4; judge = "BAD"; }

        // BUGGED FORMULA REPLICATION: Denom = 2
        // We simulate the bug here to show > 100%
        const denom = 2;
        const acc = (pts / denom) * 100;

        results.push({
            ms: ms.toFixed(1),
            judge: judge,
            points: pts,
            formula: `${pts} / ${denom}`,
            acc: acc.toFixed(2) + "%"
        });
    });

    console.table(results);
})();
