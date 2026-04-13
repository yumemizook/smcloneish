/**
 * Player Profile System with Etterna-style Skill Set Ratings (SSR)
 *
 * Skill Sets:
 *   - Stream: Continuous single-note patterns
 *   - Jumpstream: Mix of single notes and jumps (2-note chords)
 *   - Handstream: Complex chord patterns (3-4 note chords)
 *   - Chordjack: Chord-heavy jack patterns
 *   - Technical: Pattern complexity, awkward patterns
 *   - JackSpeed: Speed-focused jack patterns
 *   - Stamina: Pattern density and strain
 *   - Overall: Weighted aggregate of all skill sets
 *
 * References:
 *   - Etterna's ScoreManager.cpp → CalcPlayerRating
 *   - SSR.js for skillset-specific calculations
 */

(function() {
    'use strict';

    // Profile storage keys
    const PROFILE_KEY = 'webSM_profile';
    const PROFILE_LIST_KEY = 'webSM_profile_list';

    // Rating calculation: Etterna uses ALL PB scores with aggregate_skill algorithm

    /**
     * Default profile structure
     */
    function createDefaultProfile(name = 'Player') {
        return {
            name: name,
            createdAt: Date.now(),
            lastPlayed: Date.now(),
            totalPlays: 0,
            totalPlayTime: 0, // in seconds
            totalNotesHit: 0,
            
            // Player ratings (skillset SSRs)
            ratings: {
                stream: 0,
                jumpstream: 0,
                handstream: 0,
                chordjack: 0,
                technical: 0,
                jackSpeed: 0,
                stamina: 0,
                overall: 0
            },
            
            // Rating history for tracking improvement
            ratingHistory: [],
            
            // Session stats
            session: {
                plays: 0,
                startTime: Date.now(),
                notesHit: 0,
                totalAccuracy: 0,
                avgAccuracy: 0
            },
            
            // Stats across all plays
            stats: {
                totalMarvelous: 0,
                totalPerfect: 0,
                totalGreat: 0,
                totalGood: 0,
                totalBad: 0,
                totalMiss: 0,
                totalMinesHit: 0,
                totalHoldsHeld: 0,
                totalHoldsDropped: 0,
                highestCombo: 0,
                bestAccuracy: 0,
                worstAccuracy: 100,
                avgAccuracy: 0,
                accuracySum: 0,
                sessionsPlayed: 0
            },
            
            // Score history (top scores per chart/difficulty with skillset SSRs)
            // Structure: { 'songKey': [scoreObjects] }
            scores: {},
            
            // Play count per difficulty
            playsByDifficulty: {},
            
            // Last 50 plays for recent activity
            recentPlays: []
        };
    }

    /**
     * Load profile from localStorage
     */
    function loadProfile() {
        try {
            const saved = localStorage.getItem(PROFILE_KEY);
            if (saved) {
                const profile = JSON.parse(saved);
                // Ensure all fields exist (migration)
                const defaults = createDefaultProfile();
                return deepMerge(defaults, profile);
            }
        } catch (e) {
            console.error('Failed to load profile:', e);
        }
        return createDefaultProfile();
    }

    /**
     * Save profile to localStorage
     */
    function saveProfile(profile) {
        try {
            profile.lastPlayed = Date.now();
            localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        } catch (e) {
            console.warn('Failed to save profile:', e);
        }
    }

    /**
     * Deep merge helper for profile migration
     */
    function deepMerge(defaults, saved) {
        const result = {};
        for (const key in defaults) {
            if (saved[key] === undefined) {
                result[key] = defaults[key];
            } else if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
                result[key] = deepMerge(defaults[key], saved[key]);
            } else {
                result[key] = saved[key];
            }
        }
        return result;
    }

    /**
     * Generate song key for score storage
     */
    function getSongKey(meta, chart) {
        const title = meta.title || 'Unknown';
        const artist = meta.artist || 'Unknown';
        const diff = chart.difficulty || 'Unknown';
        const meter = chart.meter || 0;
        return `${title}|||${artist}|||${diff}|||${meter}`;
    }

    /**
     * Calculate skillset SSRs from MSD values and accuracy
     * Uses calculateSSRApprox from SSR.js
     */
    function calculateSkillsetSSRs(msd, wifePercent, playbackRate = 1.0) {
        if (!window.calculateSSRApprox || !msd) {
            return {
                stream: 0, jumpstream: 0, handstream: 0, chordjack: 0,
                technical: 0, jackSpeed: 0, stamina: 0, overall: 0
            };
        }
        return window.calculateSSRApprox(msd, wifePercent, playbackRate);
    }

    /**
     * Add a score to the profile and update ratings
     */
    function addScore(scoreData) {
        const profile = loadProfile();
        
        // Create score object with skillset SSRs
        const songKey = scoreData.songKey;
        const scoreObj = {
            date: Date.now(),
            songTitle: scoreData.songTitle,
            songArtist: scoreData.songArtist,
            difficulty: scoreData.difficulty,
            meter: scoreData.meter,
            accuracy: scoreData.accuracy,
            wifePercent: scoreData.wifePercent,
            ssr: scoreData.ssr,
            skillsetSSRs: scoreData.skillsetSSRs || {},
            grade: scoreData.grade,
            clearType: scoreData.clearType,
            maxCombo: scoreData.maxCombo,
            judgments: scoreData.judgments,
            rate: scoreData.rate || 1.0,
            playTime: scoreData.playTime || 0,
            chartMSD: scoreData.chartMSD || null
        };

        // Add to scores
        if (!profile.scores[songKey]) {
            profile.scores[songKey] = [];
        }
        profile.scores[songKey].push(scoreObj);
        
        // Sort by overall SSR descending, keep top 3 per chart
        profile.scores[songKey].sort((a, b) => (b.ssr || 0) - (a.ssr || 0));
        profile.scores[songKey] = profile.scores[songKey].slice(0, 3);

        // Update session stats
        profile.session.plays++;
        profile.session.notesHit += scoreData.totalNotes || 0;
        profile.session.totalAccuracy += scoreData.accuracy || 0;
        profile.session.avgAccuracy = profile.session.totalAccuracy / profile.session.plays;

        // Update global stats
        profile.totalPlays++;
        profile.totalPlayTime += scoreData.playTime || 0;
        profile.totalNotesHit += scoreData.totalNotes || 0;
        
        const j = scoreData.judgments || {};
        profile.stats.totalMarvelous += j.marvelous || 0;
        profile.stats.totalPerfect += j.perfect || 0;
        profile.stats.totalGreat += j.great || 0;
        profile.stats.totalGood += j.good || 0;
        profile.stats.totalBad += j.bad || 0;
        profile.stats.totalMiss += j.miss || 0;
        profile.stats.totalMinesHit += j.mine || 0;
        
        if (scoreData.maxCombo > profile.stats.highestCombo) {
            profile.stats.highestCombo = scoreData.maxCombo;
        }
        
        const acc = scoreData.accuracy || 0;
        profile.stats.accuracySum += acc;
        profile.stats.avgAccuracy = profile.stats.accuracySum / profile.totalPlays;
        
        if (acc > profile.stats.bestAccuracy) profile.stats.bestAccuracy = acc;
        if (acc < profile.stats.worstAccuracy) profile.stats.worstAccuracy = acc;

        // Update play count by difficulty
        const diffKey = `${scoreData.meter}`;
        profile.playsByDifficulty[diffKey] = (profile.playsByDifficulty[diffKey] || 0) + 1;

        // Add to recent plays
        profile.recentPlays.unshift({
            date: Date.now(),
            songTitle: scoreData.songTitle,
            difficulty: scoreData.difficulty,
            accuracy: scoreData.accuracy,
            ssr: scoreData.ssr,
            clearType: scoreData.clearType
        });
        profile.recentPlays = profile.recentPlays.slice(0, 50);

        // Recalculate player ratings
        updatePlayerRatings(profile);

        // Save profile
        saveProfile(profile);
        
        return profile;
    }

    /**
     * Calculate player ratings from all saved scores
     * Uses Etterna's CalcPlayerRating algorithm from ScoreManager.cpp
     * 
     * Etterna's algorithm:
     * 1. For each skillset, collect all eligible score SSRs
     * 2. Apply aggregate_skill(ssrs, 0.1, 1.05, 0.0, 10.24) to each skillset
     * 3. Overall rating = simple average of all skillset ratings
     */
    function updatePlayerRatings(profile) {
        const skillsets = ['stream', 'jumpstream', 'handstream', 'chordjack', 'technical', 'jackSpeed', 'stamina'];
        const skillsetSSRs = {};
        
        // Collect eligible scores for each skillset
        // From Etterna's SortTopSSRPtrs - filters for eligible scores
        for (const songKey in profile.scores) {
            const scores = profile.scores[songKey];
            // Get the PB (best SSR) for this chart - Etterna uses PBptr
            const sortedScores = scores.slice().sort((a, b) => (b.ssr || 0) - (a.ssr || 0));
            const pbScore = sortedScores[0];
            
            if (!pbScore || !pbScore.skillsetSSRs) continue;
            if (pbScore.ssr <= 0) continue; // Skip invalid scores
            
            // Add this PB's SSRs to each skillset collection
            skillsets.forEach(skillset => {
                if (!skillsetSSRs[skillset]) skillsetSSRs[skillset] = [];
                const ssr = pbScore.skillsetSSRs[skillset] || 0;
                if (ssr > 0) {
                    skillsetSSRs[skillset].push(ssr);
                }
            });
        }

        // Check if we have any scores
        const hasAnyScores = skillsets.some(ss => skillsetSSRs[ss] && skillsetSSRs[ss].length > 0);
        if (!hasAnyScores) return;

        // Calculate rating for each skillset using Etterna's aggregate_skill
        // Parameters from Etterna: aggregate_skill(ssrs, 0.1L, 1.05, 0.0, 10.24)
        const newRatings = {};
        skillsets.forEach(skillset => {
            const ssrs = skillsetSSRs[skillset] || [];
            if (ssrs.length === 0) {
                newRatings[skillset] = 0;
            } else {
                const rating = aggregateSkill(ssrs, 0.1, 1.05, 0.0, 10.24);
                // Clamp between 0 and 100 (Etterna does this)
                newRatings[skillset] = Math.max(0, Math.min(100, rating));
            }
        });

        // Overall rating = simple average of all skillset ratings
        // This is how Etterna calculates it now (they commented out the aggregate approach)
        const ssValues = skillsets.map(ss => newRatings[ss]);
        const overallSum = ssValues.reduce((a, b) => a + b, 0);
        newRatings.overall = overallSum / skillsets.length;
        
        // Clamp overall rating too
        newRatings.overall = Math.max(0, Math.min(100, newRatings.overall));

        // Round to 2 decimal places
        skillsets.forEach(ss => {
            profile.ratings[ss] = Math.round(newRatings[ss] * 100) / 100;
        });
        profile.ratings.overall = Math.round(newRatings.overall * 100) / 100;

        // Add to rating history if changed significantly
        const lastHistory = profile.ratingHistory[profile.ratingHistory.length - 1];
        if (!lastHistory || Math.abs(profile.ratings.overall - lastHistory.overall) > 0.01) {
            profile.ratingHistory.push({
                date: Date.now(),
                ...profile.ratings
            });
            // Keep last 100 entries
            if (profile.ratingHistory.length > 100) {
                profile.ratingHistory = profile.ratingHistory.slice(-100);
            }
        }
    }

    /**
     * Aggregate skill function from Etterna/MinaCalc (MinaCalcHelpers.h)
     * 
     * This is a binary search algorithm that finds the rating where:
     * sum of max(0, 2/erfc(delta_multiplier * (ssr - rating)) - 2) <= 2^(rating * 0.1)
     * 
     * Parameters (from Etterna's CalcPlayerRating):
     * - delta_multiplier: 0.1 (controls the spread of the error function)
     * - result_multiplier: 1.05 (final rating multiplier)
     * - starting_rating: 0.0 (initial rating guess)
     * - resolution: 10.24 (search step size, halves each iteration)
     */
    function aggregateSkill(ssrs, deltaMultiplier, resultMultiplier, startingRating, resolution) {
        if (ssrs.length === 0) return 0;
        
        let rating = startingRating;
        let res = resolution;
        
        // 11 iterations of binary search (same as Etterna)
        for (let i = 0; i < 11; i++) {
            let sum = 0;
            
            // Accumulate sum using erfc (complementary error function)
            // Formula: max(0, 2 / erfc(deltaMultiplier * (ssr - rating)) - 2)
            do {
                rating += res;
                sum = 0;
                for (const ssr of ssrs) {
                    const arg = deltaMultiplier * (ssr - rating);
                    // erfc(x) = 1 - erf(x), but we can use the approximation
                    // For positive x: erfc(x) ≈ exp(-x²) / (x√π + √(x² + 4/π))
                    // For negative x: erfc(x) ≈ 2 - erfc(-x)
                    const erfcVal = erfcApprox(arg);
                    const contribution = Math.max(0, 2.0 / erfcVal - 2.0);
                    sum += contribution;
                }
            } while (Math.pow(2, rating * 0.1) < sum);
            
            // Binary search: move backwards and halve resolution
            rating -= res;
            res /= 2.0;
        }
        
        // Final adjustment
        rating += res * 2.0;
        
        return rating * resultMultiplier;
    }
    
    /**
     * Approximation of the complementary error function erfc(x)
     * Used by aggregateSkill when calculating player ratings
     */
    function erfcApprox(x) {
        // Handle edge cases
        if (x < -5) return 2;  // erfc(-infinity) = 2
        if (x > 5) return 0;   // erfc(infinity) = 0
        
        // For positive x, use approximation
        if (x >= 0) {
            // Abramowitz and Stegun approximation
            const a1 = 0.254829592;
            const a2 = -0.284496736;
            const a3 = 1.421413741;
            const a4 = -1.453152027;
            const a5 = 1.061405429;
            const p = 0.3275911;
            
            const t = 1.0 / (1.0 + p * x);
            return t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5)))) * Math.exp(-x * x);
        }
        
        // For negative x: erfc(x) = 2 - erfc(-x)
        return 2.0 - erfcApprox(-x);
    }

    /**
     * Reset profile to defaults
     */
    function resetProfile() {
        const profile = createDefaultProfile();
        saveProfile(profile);
        return profile;
    }

    /**
     * Rename profile
     */
    function renameProfile(newName) {
        const profile = loadProfile();
        profile.name = newName;
        saveProfile(profile);
        return profile;
    }

    /**
     * Export profile data as JSON
     */
    function exportProfile() {
        return JSON.stringify(loadProfile(), null, 2);
    }

    /**
     * Import profile data from JSON
     */
    function importProfile(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            const defaults = createDefaultProfile();
            const profile = deepMerge(defaults, data);
            saveProfile(profile);
            return { success: true, profile: profile };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * End current session and update stats
     */
    function endSession() {
        const profile = loadProfile();
        profile.stats.sessionsPlayed++;
        
        // Reset session
        profile.session = {
            plays: 0,
            startTime: Date.now(),
            notesHit: 0,
            totalAccuracy: 0,
            avgAccuracy: 0
        };
        
        saveProfile(profile);
        return profile;
    }

    /**
     * Get profile statistics formatted for display
     */
    function getProfileStats() {
        const profile = loadProfile();
        
        // Calculate additional stats
        const totalJudgments = profile.stats.totalMarvelous + profile.stats.totalPerfect + 
                              profile.stats.totalGreat + profile.stats.totalGood + 
                              profile.stats.totalBad + profile.stats.totalMiss;
        
        const marvelousRate = totalJudgments > 0 ? (profile.stats.totalMarvelous / totalJudgments * 100).toFixed(2) : '0.00';
        const perfectRate = totalJudgments > 0 ? (profile.stats.totalPerfect / totalJudgments * 100).toFixed(2) : '0.00';
        const greatRate = totalJudgments > 0 ? (profile.stats.totalGreat / totalJudgments * 100).toFixed(2) : '0.00';
        const fcRate = profile.totalPlays > 0 ? calculateFCRate(profile).toFixed(2) : '0.00';
        
        // Play time formatting
        const playTimeHours = Math.floor(profile.totalPlayTime / 3600);
        const playTimeMinutes = Math.floor((profile.totalPlayTime % 3600) / 60);
        
        return {
            ...profile,
            formattedStats: {
                totalJudgments,
                marvelousRate,
                perfectRate,
                greatRate,
                fcRate,
                playTime: `${playTimeHours}h ${playTimeMinutes}m`,
                notesPerPlay: profile.totalPlays > 0 ? Math.floor(profile.totalNotesHit / profile.totalPlays) : 0
            }
        };
    }

    /**
     * Calculate FC rate from score history
     */
    function calculateFCRate(profile) {
        let fcCount = 0;
        let totalScored = 0;
        
        for (const songKey in profile.scores) {
            profile.scores[songKey].forEach(score => {
                totalScored++;
                const ct = score.clearType;
                if (ct === 'MFC' || ct === 'WF' || ct === 'SDP' || ct === 'PFC' || 
                    ct === 'BF' || ct === 'SDG' || ct === 'FC') {
                    fcCount++;
                }
            });
        }
        
        return totalScored > 0 ? (fcCount / totalScored * 100) : 0;
    }

    /**
     * Get top scores sorted by SSR
     */
    function getTopScores(limit = 25) {
        const profile = loadProfile();
        const allScores = [];
        
        for (const songKey in profile.scores) {
            profile.scores[songKey].forEach(s => {
                allScores.push(s);
            });
        }
        
        allScores.sort((a, b) => (b.ssr || 0) - (a.ssr || 0));
        return allScores.slice(0, limit);
    }

    // Expose to global scope
    window.PlayerProfile = {
        load: loadProfile,
        save: saveProfile,
        addScore: addScore,
        reset: resetProfile,
        rename: renameProfile,
        export: exportProfile,
        import: importProfile,
        endSession: endSession,
        getStats: getProfileStats,
        getTopScores: getTopScores,
        calculateSkillsetSSRs: calculateSkillsetSSRs,
        getSongKey: getSongKey,
        createDefault: createDefaultProfile
    };

    // Initialize on load
    console.log('[Profile] Player Profile system loaded');
})();
