(function () {
    console.log("--- J4 Curve Debug ---");
    // Mock userConfig
    const originalDiff = window.userConfig ? window.userConfig.judgeDifficulty : 4;
    window.userConfig.judgeDifficulty = 4;

    // Ensure math depends
    if (typeof math === 'undefined' || !math.erf) { console.error("Math.js not loaded"); return; }

    // Re-verify constants being used
    const checkPts = [0, 22.5, 45, 65, 90, 135, 180];
    const results = [];

    checkPts.forEach(ms => {
        const score = calculateAccuracy(ms);
        results.push({ ms: ms, score: score.toFixed(4) });
    });

    console.table(results);

    window.userConfig.judgeDifficulty = originalDiff;
})();
