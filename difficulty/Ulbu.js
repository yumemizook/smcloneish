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
  var ohJumpMods = [new OHJumpMod(), new OHJumpMod()];
  var balanceMods = [new BalanceMod(), new BalanceMod()];
  var chaosMods = [new ChaosMod(), new ChaosMod()];
  var wrBalanceMods = [new WideRangeBalanceMod(), new WideRangeBalanceMod()];
  var wrAnchorMods = [new WideRangeAnchorMod(), new WideRangeAnchorMod()];
  var ohtMods = [new OHTrillMod(), new OHTrillMod()];
  var minijackMods = [new MinijackMod(), new MinijackMod()];
  var wrRollMods = [new WideRangeRollMod(), new WideRangeRollMod()];
  var wrjtMods = [new WideRangeJumptrillMod(), new WideRangeJumptrillMod()];
  var wrjjMods = [new WideRangeJJMod(), new WideRangeJJMod()];
  var anchorSequencers = [new AnchorSequencer(), new AnchorSequencer()];

  // Setup pattern mods that need window configuration
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    wrBalanceMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrAnchorMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    ohtMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrRollMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrjtMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
    wrjjMods[hand].setup(MAX_MOVING_WINDOW_SIZE);
  }

  // Store pattern mods in calc
  calc.patternMods = {
    streamMods: streamMods, jsMods: jsMods, hsMods: hsMods,
    cjMods: cjMods, cjDensityMods: cjDensityMods, ohJumpMods: ohJumpMods,
    balanceMods: balanceMods, chaosMods: chaosMods,
    wrBalanceMods: wrBalanceMods, wrAnchorMods: wrAnchorMods,
    ohtMods: ohtMods, minijackMods: minijackMods, wrRollMods: wrRollMods, wrjtMods: wrjtMods, wrjjMods: wrjjMods,
    anchorSequencers: anchorSequencers,
  };

  // Row-by-row sequencing to build metaItvInfo and itvHandInfo per hand
  for (var hi = 0; hi < BOTH_HANDS.length; hi++) {
    var hand = BOTH_HANDS[hi];
    var lastMri = createMetaRowInfo();
    var lastMt = meta_type.meta_type_init;
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
        var colType = handCount >= 2 ? col_ohjump : (handNotes === 0 ? col_left : ((handNotes & (hand === LEFT_HAND ? 0b0001 : 0b0100)) ? col_left : col_right));

        if (handCount > 0) {
          if (hand === LEFT_HAND) {
            if (handNotes & 0b0001) itvhi.col_taps[0]++;
            if (handNotes & 0b0010) itvhi.col_taps[1]++;
          } else {
            if (handNotes & 0b0100) itvhi.col_taps[0]++;
            if (handNotes & 0b1000) itvhi.col_taps[1]++;
          }
          if (handCount >= 2) itvhi.col_taps[col_ohjump] += handCount;
        }

        // Row-by-row meta sequencing
        var mri = createMetaRowInfo();
        mri.time = row.rowTime;
        mri.count = handCount;
        mri.col_type = colType;
        mri.last_count = lastMri.count;
        mri.last_last_count = lastMri.last_last_count;
        mri.notes = handNotes;
        mri.last_notes = lastMri.notes;
        mri.last_last_notes = lastMri.last_last_notes;
        mri.ms_now = lastMri.time > -4 ? msFrom(row.rowTime, lastMri.time) : 1000;

        var baseTypeNow = base_type.base_type_init;
        if (lastMri.count > 0 && handCount > 0) {
          if (lastMri.count === 1 && handCount === 1) {
            if (lastMri.col_type === col_left && colType === col_right) baseTypeNow = base_type.base_left_right;
            else if (lastMri.col_type === col_right && colType === col_left) baseTypeNow = base_type.base_right_left;
            else baseTypeNow = base_type.base_single_single;
          } else if (lastMri.count === 1 && handCount >= 2) {
            baseTypeNow = base_type.base_single_jump;
          } else if (lastMri.count >= 2 && handCount === 1) {
            baseTypeNow = base_type.base_jump_single;
          } else if (lastMri.count >= 2 && handCount >= 2) {
            baseTypeNow = base_type.base_jump_jump;
          }
        }
        mitvi._base_types[baseTypeNow] = (mitvi._base_types[baseTypeNow] || 0) + handCount;

        updateItvTapCounts(mitvi._itvi, handCount);
        basicRowSequencing(mri, lastMri, mitvi);

        // Advance complex pattern mod sequencers
        var mt = determine_meta_type(handNotes, lastMri.notes, lastMri.last_last_notes, handCount, lastMri.count, lastMri.last_last_count);
        ohtMods[hand].operator(itvhi, mt, mri.ms_now);
        if (handCount > 0) {
          anchorSequencers[hand].advance_sequencing(colType, row.rowTime, mri.ms_now);
          wrRollMods[hand].advance_sequencing(baseTypeNow, mt, lastMt, anchorSequencers[hand].get_any_ms_window(), anchorSequencers[hand].get_cc_ms_now());
          wrjtMods[hand].advance_sequencing(baseTypeNow, mt, lastMt, anchorSequencers[hand].get_any_ms_window());
          wrjjMods[hand].advance_sequencing(colType, row.rowTime);
        }
        if (handCount > 0) {
          ohJumpMods[hand].advance_sequencing(colType, baseTypeNow);
          minijackMods[hand].advance_sequencing(colType, mri.ms_now);
        }
        if (popcount(row.rowNotes & HAND_COL_MASKS[hand === LEFT_HAND ? RIGHT_HAND : LEFT_HAND]) > 0) {
          minijackMods[hand].advance_off_hand_sequencing();
        }

        if (handCount > 0) {
          chaosMods[hand].advance_sequencing(anchorSequencers[hand].get_any_ms_window());
        }

        lastMri = mri;
        lastMt = mt;
      }

      calc.itvTotalTaps[itv] = totalTaps;
      calc.itvJumpTaps[itv] = jumpTaps;

      // End of interval: finalize dependent mods before resetting interval state
      calc.depOHT[hand][itv] = ohtMods[hand].operator(itvhi);
      calc.depStream[hand][itv] = streamMods[hand].operator(mitvi);
      calc.depJS[hand][itv] = jsMods[hand].operator(mitvi);
      calc.depHS[hand][itv] = hsMods[hand].operator(mitvi);
      calc.depCJ[hand][itv] = cjMods[hand].operator(mitvi);
      calc.depCJDensity[hand][itv] = cjDensityMods[hand].operator(mitvi);
      calc.depOHJ[hand][itv] = ohJumpMods[hand].operator(mitvi, itvhi);
      calc.depMinijack[hand][itv] = minijackMods[hand].operator(itvhi);
      calc.depChaos[hand][itv] = chaosMods[hand].operator(calc.itvTotalTaps[itv]);
      calc.depBalance[hand][itv] = balanceMods[hand].operator(itvhi);
      calc.depWRBalance[hand][itv] = wrBalanceMods[hand].operator(itvhi);
      calc.depWRAnchor[hand][itv] = wrAnchorMods[hand].operator(itvhi, anchorSequencers[hand]);
      calc.depWRRoll[hand][itv] = wrRollMods[hand].operator(itvhi);
      calc.depWRJT[hand][itv] = wrjtMods[hand].operator(itvhi);
      calc.depWRJJ[hand][itv] = wrjjMods[hand].operator(itvhi);

      interval_end_itvhi(itvhi);
      anchorSequencers[hand].interval_end();
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
    var thingMods = theThing.getModsAndReset();
    calc.seqTheThing[itv] = thingMods.theThing;
    calc.seqTheThing2[itv] = thingMods.theThing2;
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
      var d = getItvPatternData(calc, hand, itv);
      var npsBase = calc.initBaseDiffNPS[hand][itv];

      var streamPm = calc.depStream[hand][itv];
      var jsPm = calc.depJS[hand][itv];
      var hsPm = calc.depHS[hand][itv];
      var cjPm = calc.depCJ[hand][itv];
      var cjDensityPm = calc.depCJDensity[hand][itv];
      var ohjPm = calc.depOHJ[hand][itv];
      var balancePm = calc.depBalance[hand][itv];
      var chaosPm = calc.depChaos[hand][itv];
      var wrBalancePm = calc.depWRBalance[hand][itv];
      var wrAnchorPm = calc.depWRAnchor[hand][itv];
      var ohtPm = calc.depOHT[hand][itv];
      var wrRollPm = calc.depWRRoll[hand][itv];
      var wrjtPm = calc.depWRJT[hand][itv];
      var wrjjPm = calc.depWRJJ[hand][itv];
      var vohtPm = calc.seqVOHT[itv];
      var flamJamPm = calc.seqFlamJam[itv];
      var theThingPm = calc.seqTheThing[itv];
      var theThing2Pm = calc.seqTheThing2[itv];
      var rollPm = pmRoll(d);
      var rollJsPm = pmRollJS(d);
      var minijackPm = calc.depMinijack[hand][itv];
      var hsDensityPm = pmHSDensity(d);

      for (var ss = 0; ss < NUM_SKILLSET; ss++) {
        if (ss === Skill.Overall || ss === Skill.Stamina) continue;
        var pmodProduct = 1.0;
        var adjDiff, stamBase;

        switch (ss) {
          case Skill.Stream:
            pmodProduct = streamPm * ohtPm * vohtPm * rollPm * wrRollPm * wrjtPm * wrjjPm * flamJamPm;
            adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
            stamBase = adjDiff;
            break;
          case Skill.Jumpstream:
            pmodProduct = jsPm * wrBalancePm * wrjtPm * wrjjPm * vohtPm * rollJsPm * flamJamPm;
            adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
            adjDiff /= Math.max(hsPm, 1.0);
            adjDiff /= Math.sqrt(Math.max(ohtPm * 0.95, 0.5));
            var hsProd = hsPm * balancePm * chaosPm * wrBalancePm;
            stamBase = Math.max(adjDiff, npsBase * hsProd);
            break;
          case Skill.Handstream:
            pmodProduct = hsPm * ohtPm * theThingPm * wrRollPm * wrjtPm * wrjjPm * vohtPm * flamJamPm * hsDensityPm;
            adjDiff = npsBase * pmodProduct * BASE_SCALERS[ss];
            var jsProd = jsPm * balancePm * chaosPm * wrBalancePm;
            stamBase = Math.max(adjDiff, npsBase * jsProd);
            break;
          case Skill.Chordjack:
            pmodProduct = cjPm * wrjtPm * vohtPm * flamJamPm;
            adjDiff = calc.initBaseDiffCJ[hand][itv] * pmodProduct * BASE_SCALERS[ss];
            stamBase = npsBase * pmodProduct * BASE_SCALERS[ss];
            break;
          case Skill.Technical:
            pmodProduct = ohtPm * vohtPm * balancePm * rollPm * chaosPm * wrjtPm * wrjjPm * wrRollPm * flamJamPm * minijackPm * theThingPm * theThing2Pm;
            var techBase = calc.initBaseDiffTech[hand][itv];
            adjDiff = techBase * pmodProduct * BASE_SCALERS[ss];
            adjDiff /= Math.max(Math.pow(cjPm + 0.05, 2.0), 1.0);
            adjDiff *= Math.sqrt(ohtPm);
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
