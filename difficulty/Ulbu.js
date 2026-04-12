/**
 * Ulbu — sequencer orchestration and InitAdjDiff.
 * Mirrors Etterna's UlbuBase.h / Ulbu.h.
 * Runs row-by-row sequencers across all intervals, applies pattern mod products.
 */

// ─── runSequencers ──────────────────────────────────────────────────────

function runSequencers(calc) {
  var flamJam = new FlamJamMod();
  var theThing = new TheThingMod();
  var voht = new VOHTMod();
  flamJam.setup();
  theThing.setup();
  voht.setup();

  // Instantiate stateful pattern mod classes per hand
  var streamMods = [new StreamMod(), new StreamMod()];
  var jsMods = [new JSMod(), new JSMod()];
  var hsMods = [new HSMod(), new HSMod()];
  var cjMods = [new CJMod(), new CJMod()];
  var cjDensityMods = [new CJDensityMod(), new CJDensityMod()];
  var balanceMods = [new BalanceMod(), new BalanceMod()];
  var chaosMods = [new ChaosMod(), new ChaosMod()];
  var wrBalanceMods = [new WideRangeBalanceMod(), new WideRangeBalanceMod()];
  var wrAnchorMods = [new WideRangeAnchorMod(), new WideRangeAnchorMod()];
  var ohtMods = [new OHTrillMod(), new OHTrillMod()];
  var wrRollMods = [new WideRangeRollMod(), new WideRangeRollMod()];
  var wrjtMods = [new WideRangeJumptrillMod(), new WideRangeJumptrillMod()];
  var anchorSequencers = [new AnchorSequencer(), new AnchorSequencer()];

  // Setup pattern mods that need window configuration
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    wrBalanceMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrAnchorMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    ohtMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrRollMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrjtMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
  }

  // Store pattern mods in calc
  calc.patternMods = {
    streamMods: streamMods, jsMods: jsMods, hsMods: hsMods,
    cjMods: cjMods, cjDensityMods: cjDensityMods,
    balanceMods: balanceMods, chaosMods: chaosMods,
    wrBalanceMods: wrBalanceMods, wrAnchorMods: wrAnchorMods,
    ohtMods: ohtMods, wrRollMods: wrRollMods, wrjtMods: wrjtMods,
    anchorSequencers: anchorSequencers,
  };

  // Row-by-row sequencing to build metaItvInfo and itvHandInfo per hand
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    var lastMri = createMetaRowInfo();
    lastMri.time = -5.0;

    for (var itv = 0; itv < calc.numitv; itv++) {
      var rows = calc.adjNi[itv];
      var totalTaps = 0;
      var jumpTaps = 0;
      var mitvi = calc.metaItvInfo[hand][itv];
      var itvhi = calc.itvHandInfo[hand][itv];
      handleItvIntervalEnd(mitvi);

      for (var ri = 0; ri < rows.length; ri++) {
        var row = rows[ri];
        var pc = popcount(row.rowNotes);
        totalTaps += pc;
        if (pc === 2) jumpTaps += pc;

        var handMask = HAND_COL_MASKS[hand];
        var handNotes = row.rowNotes & handMask;
        var handCount = popcount(handNotes);

        if (handCount > 0) {
          if (hand === LEFT_HAND) {
            if (handNotes & 0b0001) itvhi.col_taps[0]++;
            if (handNotes & 0b0010) itvhi.col_taps[1]++;
          } else {
            if (handNotes & 0b0100) itvhi.col_taps[0]++;
            if (handNotes & 0b1000) itvhi.col_taps[1]++;
          }
        }

        // Row-by-row meta sequencing
        var mri = createMetaRowInfo();
        mri.time = row.rowTime;
        mri.count = handCount;
        mri.last_count = lastMri.count;
        mri.last_last_count = lastMri.last_last_count;
        mri.notes = handNotes;
        mri.last_notes = lastMri.notes;
        mri.last_last_notes = lastMri.last_last_notes;
        mri.ms_now = lastMri.time > -4 ? msFrom(row.rowTime, lastMri.time) : 1000;

        updateItvTapCounts(mitvi._itvi, handCount);
        basicRowSequencing(mri, lastMri, mitvi);

        // Advance complex pattern mod sequencers
        var mt = determine_meta_type(handNotes, lastMri.notes, lastMri.last_last_notes, handCount, lastMri.count, lastMri.last_last_count);
        ohtMods[hand].operator(itvhi, mt, mri.ms_now);
        anchorSequencers[hand].advance_sequencing(handNotes);

        if (mri.ms_now > 0 && mri.ms_now < 10000) {
          chaosMods[hand].advance_sequencing([mri.ms_now, lastMri.ms_now || mri.ms_now]);
        }

        lastMri = mri;
      }

      // End of interval
      interval_end_itvhi(itvhi);
      anchorSequencers[hand].interval_end();
      chaosMods[hand].interval_end();

      // Per-interval pattern mod evaluation
      streamMods[hand].operator(mitvi);
      jsMods[hand].operator(mitvi);
      hsMods[hand].operator(mitvi);
      cjMods[hand].operator(mitvi);
      cjDensityMods[hand].operator(mitvi);
      chaosMods[hand].operator(calc.itvTotalTaps[itv]);
      balanceMods[hand].operator(itvhi);
      wrBalanceMods[hand].operator(itvhi);
      wrAnchorMods[hand].operator(itvhi, anchorSequencers[hand]);
      wrRollMods[hand].operator(itvhi);
      wrjtMods[hand].operator(itvhi);

      calc.itvTotalTaps[itv] = totalTaps;
      calc.itvJumpTaps[itv] = jumpTaps;
    }
  }

  // Second pass: FlamJam, TheThing, VOHT (hand-independent)
  var lastTime = -5.0;
  for (var itv = 0; itv < calc.numitv; itv++) {
    var rows = calc.adjNi[itv];
    var totalTaps = 0;
    var jumpTaps = 0;

    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var pc = popcount(row.rowNotes);
      totalTaps += pc;
      if (pc === 2) jumpTaps += pc;

      var msNow = lastTime > -4 ? msFrom(row.rowTime, lastTime) : 1000;
      lastTime = row.rowTime;

      flamJam.advanceSequencing(msNow, row.rowNotes);
      theThing.advanceSequencing(msNow, row.rowNotes);
      voht.advanceSequencing(msNow, row.rowNotes);
    }

    calc.seqFlamJam[itv] = flamJam.getModAndReset();
    calc.seqTheThing[itv] = theThing.getModAndReset();
    calc.seqVOHT[itv] = voht.getModAndReset(totalTaps, jumpTaps);
  }
}

// ─── initAdjDiff ────────────────────────────────────────────────────────

function initAdjDiff(calc) {
  var pm = calc.patternMods;
  if (!pm) {
    // Fallback to simplified pattern mods
    for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
      var hand = BOTH_HANDS[hi];
      for (var itv = 0; itv < calc.numitv; itv++) {
        var d = getItvPatternData(calc, hand, itv);
        var npsBase = calc.initBaseDiffNPS[hand][itv];
        for (var ss = 0; ss < NUM_SKILLSET; ss++) {
          if (ss === Skill.Overall || ss === Skill.Stamina) continue;
          var pmodProduct = ssPatternProduct(ss, d, calc, itv);
          var adjDiff, stamBase;
          switch (ss) {
            case Skill.Chordjack:
              adjDiff = calc.initBaseDiffCJ[hand][itv] * pmodProduct * BASE_SCALERS[ss];
              stamBase = npsBase * pmodProduct * BASE_SCALERS[ss];
              break;
            case Skill.Technical:
              var techBase = calc.initBaseDiffTech[hand][itv];
              adjDiff = techBase * pmodProduct * BASE_SCALERS[ss];
              var cjPmV = pmCJ(d);
              adjDiff /= Math.max(Math.pow(cjPmV + 0.05, 2.0), 1.0);
              adjDiff *= Math.sqrt(pmOHJ(d));
              stamBase = npsBase * pmodProduct * BASE_SCALERS[ss];
              break;
            case Skill.Jumpstream:
              adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
              var hsPmV = pmHS(d);
              adjDiff /= Math.max(hsPmV, 1.0);
              adjDiff /= Math.sqrt(Math.max(pmOHJ(d) * 0.95, 0.5));
              var hsProd = ssPatternProduct(Skill.Handstream, d, calc, itv);
              stamBase = Math.max(adjDiff, npsBase * hsProd);
              break;
            case Skill.Handstream:
              adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
              var jsProd = ssPatternProduct(Skill.Jumpstream, d, calc, itv);
              stamBase = Math.max(adjDiff, npsBase * jsProd);
              break;
            default:
              adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
              stamBase = adjDiff;
              break;
          }
          calc.baseAdjDiff[hand][ss][itv] = adjDiff;
          calc.baseDiffForStam[hand][ss][itv] = stamBase;
        }
        calc.baseAdjDiff[hand][Skill.JackSpeed][itv] = npsBase * BASE_SCALERS[Skill.JackSpeed];
        calc.baseDiffForStam[hand][Skill.JackSpeed][itv] = npsBase * BASE_SCALERS[Skill.JackSpeed];
      }
    }
    return;
  }

  // Use stateful pattern mod classes
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    for (var itv = 0; itv < calc.numitv; itv++) {
      var mitvi = calc.metaItvInfo[hand][itv];
      var itvhi = calc.itvHandInfo[hand][itv];
      var npsBase = calc.initBaseDiffNPS[hand][itv];

      var streamPm = pm.streamMods[hand].operator(mitvi);
      var jsPm = pm.jsMods[hand].operator(mitvi);
      var hsPm = pm.hsMods[hand].operator(mitvi);
      var cjPm = pm.cjMods[hand].operator(mitvi);
      var cjDensityPm = pm.cjDensityMods[hand].operator(mitvi);
      var balancePm = pm.balanceMods[hand].operator(itvhi);
      var chaosPm = pm.chaosMods[hand].operator(calc.itvTotalTaps[itv]);
      var wrBalancePm = pm.wrBalanceMods[hand].operator(itvhi);
      var wrAnchorPm = pm.wrAnchorMods[hand].operator(itvhi, pm.anchorSequencers[hand]);
      var ohtPm = pm.ohtMods[hand].pmod;
      var wrRollPm = pm.wrRollMods[hand].operator(itvhi);
      var wrjtPm = pm.wrjtMods[hand].operator(itvhi);

      for (var ss = 0; ss < NUM_SKILLSET; ss++) {
        if (ss === Skill.Overall || ss === Skill.Stamina) continue;
        var pmodProduct = 1.0;
        var adjDiff, stamBase;

        switch (ss) {
          case Skill.Stream:
            pmodProduct = streamPm;
            adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
            stamBase = adjDiff;
            break;
          case Skill.Jumpstream:
            pmodProduct = jsPm * balancePm * chaosPm * wrBalancePm;
            adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
            adjDiff /= Math.max(hsPm, 1.0);
            adjDiff *= calc.seqVOHT[itv];
            var hsProd = hsPm * balancePm * chaosPm * wrBalancePm;
            stamBase = Math.max(adjDiff, npsBase * hsProd);
            break;
          case Skill.Handstream:
            pmodProduct = hsPm * balancePm * chaosPm * cjDensityPm * wrBalancePm;
            adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
            var jsProd = jsPm * balancePm * chaosPm * wrBalancePm;
            stamBase = Math.max(adjDiff, npsBase * jsProd);
            break;
          case Skill.Chordjack:
            pmodProduct = cjPm * cjDensityPm * ohtPm * wrRollPm * wrjtPm * wrAnchorPm;
            adjDiff = calc.initBaseDiffCJ[hand][itv] * pmodProduct * BASE_SCALERS[ss];
            stamBase = npsBase * pmodProduct * BASE_SCALERS[ss];
            break;
          case Skill.Technical:
            pmodProduct = streamPm * jsPm * hsPm * cjPm * balancePm * chaosPm * cjDensityPm * wrBalancePm;
            var techBase = calc.initBaseDiffTech[hand][itv];
            adjDiff = techBase * pmodProduct * BASE_SCALERS[ss];
            adjDiff /= Math.max(Math.pow(cjPm + 0.05, 2.0), 1.0);
            adjDiff *= Math.sqrt(calc.seqVOHT[itv]);
            stamBase = npsBase * pmodProduct * BASE_SCALERS[ss];
            break;
          default:
            adjDiff = npsBase * BASE_SCALERS[ss];
            stamBase = adjDiff;
            break;
        }

        calc.baseAdjDiff[hand][ss][itv] = adjDiff;
        calc.baseDiffForStam[hand][ss][itv] = stamBase;
      }

      calc.baseAdjDiff[hand][Skill.JackSpeed][itv] = npsBase * BASE_SCALERS[Skill.JackSpeed];
      calc.baseDiffForStam[hand][Skill.JackSpeed][itv] = npsBase * BASE_SCALERS[Skill.JackSpeed];
    }
  }
}
