/**
 * TrillSequencing — port of HA_Sequencers/TrillSequencing.h from Etterna's MinaCalc.
 * Detects two-hand trills and produces VOHT pattern mod.
 */

// ─── Column type helpers ────────────────────────────────────────────────

var TrillColType = {
  Init: 0,
  Left: 1,
  Right: 2,
  OhJump: 3,
};

var TrillHand = {
  Left: 0,
  Right: 1,
};

var TrillScenario = {
  TheLackThereof: 0,
  NeedOpposite: 1,
};

function determineTrillColType(notes, handMask) {
  var handNotes = notes & handMask;
  var pc = popcount(handNotes);
  if (pc >= 2) return TrillColType.OhJump;
  if (handMask === 0b1100) {
    if (handNotes & 0b0100) return TrillColType.Left;
    return TrillColType.Right;
  } else {
    if (handNotes & 0b0001) return TrillColType.Left;
    return TrillColType.Right;
  }
}

// ─── TwoHandTrill ───────────────────────────────────────────────────────

function TwoHandTrill() {
  this.currentHand = TrillHand.Left;
  this.leftHandState = TrillColType.Init;
  this.rightHandState = TrillColType.Init;
  this.currentScenario = TrillScenario.TheLackThereof;
  this.curLength = 0;
  this.jumpCount = 0;
  this.trillMs = new CalcMovingWindow();
  this.trillsInInterval = 0;
  this.totalTaps = 0;
  this.cvThreshold = 0.5;
  this.lastNotes = 0;
  this.lastLastNotes = 0;
}

TwoHandTrill.prototype.twoHandJump = function(notes) {
  return (notes & 0b1100) !== 0 && (notes & 0b0011) !== 0;
};

TwoHandTrill.prototype.process = function(msNow, notes) {
  var notesHand = TrillHand.Left;
  var notesColtype = TrillColType.Init;
  var prevNotes = this.lastNotes;
  var prevPrevNotes = this.lastLastNotes;
  this.lastLastNotes = this.lastNotes;
  this.lastNotes = notes;

  if (this.twoHandJump(notes)) {
    if (this.twoHandJump(prevNotes)) { this.deadTrill(); return; }
    if (this.twoHandJump(prevPrevNotes)) { this.deadTrill(); return; }
    if ((notes & 0b1111) === 0b1111) {
      this.deadTrill(); return;
    } else if ((notes & 0b1100) === 0b1100) {
      notesHand = TrillHand.Left;
      notesColtype = TrillColType.OhJump;
    } else if ((notes & 0b0011) === 0b0011) {
      notesHand = TrillHand.Right;
      notesColtype = TrillColType.OhJump;
    } else {
      if ((notes & prevPrevNotes) !== 0 && (notes & prevNotes) === 0) {
        var ppn = notes & prevPrevNotes;
        if ((ppn & 0b1100) !== 0) {
          notesHand = TrillHand.Left;
          notesColtype = determineTrillColType(notes, 0b1100);
        } else if ((ppn & 0b0011) !== 0) {
          notesHand = TrillHand.Right;
          notesColtype = determineTrillColType(notes, 0b0011);
        } else {
          this.deadTrill(); return;
        }
      } else {
        this.deadTrill(); return;
      }
    }
  } else if ((notes & 0b1100) !== 0) {
    notesHand = TrillHand.Left;
    notesColtype = determineTrillColType(notes, 0b1100);
  } else if ((notes & 0b0011) !== 0) {
    notesHand = TrillHand.Right;
    notesColtype = determineTrillColType(notes, 0b0011);
  } else {
    this.fullReset(); return;
  }

  switch (this.currentScenario) {
    case TrillScenario.TheLackThereof:
      this.currentHand = notesHand;
      this.setHandStates(notesColtype);
      this.currentScenario = TrillScenario.NeedOpposite;
      break;

    case TrillScenario.NeedOpposite:
      if (this.currentHand === notesHand) {
        this.deadTrill();
      } else {
        if (notesColtype === TrillColType.OhJump) {
          this.jumpCount++;
        }
        if (this.currentHand === TrillHand.Left) {
          if (this.rightHandState === TrillColType.Init ||
              this.rightHandState === notesColtype) {
            this.rightHandState = notesColtype;
            this.calcTrill(msNow);
            this.curLength++;
            this.totalTaps++;
          } else {
            this.deadTrill();
            this.rightHandState = notesColtype;
            this.currentScenario = TrillScenario.NeedOpposite;
          }
        } else {
          if (this.leftHandState === TrillColType.Init ||
              this.leftHandState === notesColtype) {
            this.leftHandState = notesColtype;
            this.calcTrill(msNow);
            this.curLength++;
            this.totalTaps++;
          } else {
            this.deadTrill();
            this.leftHandState = notesColtype;
            this.currentScenario = TrillScenario.NeedOpposite;
          }
        }
      }
      if (this.currentScenario === TrillScenario.NeedOpposite) {
        this.currentHand = notesHand;
      }
      break;
  }
};

TwoHandTrill.prototype.setHandStates = function(coltype) {
  if (this.currentHand === TrillHand.Left) {
    this.leftHandState = coltype;
  } else {
    this.rightHandState = coltype;
  }
};

TwoHandTrill.prototype.calcTrill = function(msNow) {
  this.trillMs.push(msNow);
  return true;
};

TwoHandTrill.prototype.fullReset = function() {
  this.trillsInInterval = 0;
  this.totalTaps = 0;
  this.curLength = 0;
  this.trillMs.zero();
  this.currentScenario = TrillScenario.TheLackThereof;
  this.leftHandState = TrillColType.Init;
  this.rightHandState = TrillColType.Init;
  this.lastNotes = 0;
  this.lastLastNotes = 0;
};

TwoHandTrill.prototype.deadTrill = function() {
  this.curLength = 0;
  this.trillMs.zero();
  this.currentScenario = TrillScenario.TheLackThereof;
  this.leftHandState = TrillColType.Init;
  this.rightHandState = TrillColType.Init;
  this.lastNotes = 0;
  this.lastLastNotes = 0;
};

// ─── THTSequencing ──────────────────────────────────────────────────────

function THTSequencing() {
  this.trill = new TwoHandTrill();
  this.trillBuffer = 0;
  this.trillScaler = 1;
  this.jumpBuffer = 0;
  this.jumpScaler = 1;
  this.jumpWeight = 0.5;
  this.minVal = 0;
  this.maxVal = 1.5;
}

THTSequencing.prototype.setParams = function(cv, tbuffer, tscaler, jbuffer, jscaler, jweight, min, max) {
  this.trill.cvThreshold = cv;
  this.trillBuffer = tbuffer;
  this.trillScaler = tscaler;
  this.jumpBuffer = jbuffer;
  this.jumpScaler = jscaler;
  this.jumpWeight = jweight;
  this.minVal = min;
  this.maxVal = max;
};

THTSequencing.prototype.advance = function(msNow, notes) {
  this.trill.process(msNow, notes);
};

THTSequencing.prototype.reset = function() {
  this.trill.fullReset();
};

THTSequencing.prototype.get = function(totalTaps, jumpTaps) {
  var trillTaps = this.trill.totalTaps;
  var trillJumps = this.trill.jumpCount;
  if (totalTaps === 0) return 0;

  var trillProportion =
    ((trillTaps + this.trillBuffer) /
     Math.max(totalTaps - this.trillBuffer, 1)) *
    this.trillScaler;

  var jumpProportion =
    ((jumpTaps - trillJumps + this.jumpBuffer) /
     Math.max(totalTaps - this.jumpBuffer, 1)) *
    this.jumpScaler;

  var w1 = Math.max(0, Math.min(1 - this.jumpWeight, 1));
  var prop = (w1 * trillProportion + 1 * jumpProportion) / (w1 + 1);

  return Math.max(this.minVal, Math.min(prop, this.maxVal));
};

// ─── VOHTMod ────────────────────────────────────────────────────────────

function VOHTMod() {
  this.tht = new THTSequencing();
  this.minMod = 0.5;
  this.maxMod = 1.0;
  this.base = 1.0;
}

VOHTMod.prototype.setup = function() {
  this.tht.setParams(0.5, 0, 1, 0, 1, 0.5, 0, 1.5);
};

VOHTMod.prototype.advanceSequencing = function(msNow, notes) {
  this.tht.advance(msNow, notes);
};

VOHTMod.prototype.getModAndReset = function(totalTaps, jumpTaps) {
  var trillProp = this.tht.get(totalTaps, jumpTaps);
  var pmod = Math.max(this.minMod, Math.min(this.base - trillProp * 0.8, this.maxMod));
  this.tht.reset();
  return pmod;
};
