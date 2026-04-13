/**
 * ThingSequencing — port of HA_Sequencers/ThingSequencing.h from Etterna's MinaCalc.
 * Detects patterns that decompose to jumptrills or easily-mashable sequences.
 */

var MAX_SLIPS = 4;

// ─── SlipSlide enums ────────────────────────────────────────────────────
var SlipSlide = {
  Unbeginninged: 0,
  NeedsSingle: 1,
  Needs23Jump: 2,
  NeedsOpposingSingle: 3,
  NeedsOpposingOhJump: 4,
  Complete: 5,
};

var SlipSlide2 = {
  Unbeginninged: 0,
  NeedsSingle: 1,
  NeedsDoor: 2,
  NeedsBlaap: 3,
  NeedsOpposingOhJump: 4,
  Complete: 5,
};

// ─── TheSlip (thing 1) ─────────────────────────────────────────────────

function TheSlip() {
  this.slip = 0;
  this.slippinTillYaSlipsComeTrue = false;
  this.slide = 0;
}

TheSlip.prototype.theSlipIsTheBoot = function(notes) {
  switch (this.slide) {
    case SlipSlide.NeedsSingle:
      if (this.slip === 3 || this.slip === 7) return notes === 8;
      return notes === 1;
    case SlipSlide.Needs23Jump:
      return notes === 6;
    case SlipSlide.NeedsOpposingSingle:
      if (this.slip === 3 || this.slip === 7) return notes === 1;
      return notes === 8;
    case SlipSlide.NeedsOpposingOhJump:
      if (this.slip === 3 || this.slip === 7) return notes === 12 || notes === 14;
      return notes === 3 || notes === 7;
    default:
      return false;
  }
};

TheSlip.prototype.start = function(msNow, notes) {
  this.slip = notes;
  this.slide = 0;
  this.slippinTillYaSlipsComeTrue = true;
  this.grow(msNow, notes);
};

TheSlip.prototype.grow = function(_msNow, _notes) {
  ++this.slide;
};

TheSlip.prototype.reset = function() {
  this.slippinTillYaSlipsComeTrue = false;
};

// ─── TheSlip2 (thing 2) ────────────────────────────────────────────────

function TheSlip2() {
  this.slip = 0;
  this.slippinTillYaSlipsComeTrue = false;
  this.slide = 0;
}

TheSlip2.prototype.theSlipIsTheBoot = function(notes) {
  switch (this.slide) {
    case SlipSlide2.NeedsSingle:
      if (this.slip === 3) return notes === 4;
      return notes === 2;
    case SlipSlide2.NeedsDoor:
      if (this.slip === 3) return notes === 10;
      return notes === 5;
    case SlipSlide2.NeedsBlaap:
      if (this.slip === 3) return notes === 1;
      return notes === 8;
    case SlipSlide2.NeedsOpposingOhJump:
      if (this.slip === 3) return notes === 12;
      return notes === 3;
    default:
      return false;
  }
};

TheSlip2.prototype.start = function(msNow, notes) {
  this.slip = notes;
  this.slide = 0;
  this.slippinTillYaSlipsComeTrue = true;
  this.grow(msNow, notes);
};

TheSlip2.prototype.grow = function(_msNow, _notes) {
  ++this.slide;
};

TheSlip2.prototype.reset = function() {
  this.slippinTillYaSlipsComeTrue = false;
};

// ─── TTSequencing (thing 1) ─────────────────────────────────────────────

function TTSequencing() {
  this.fizz = new TheSlip();
  this.slipCounter = 0;
  this.modParts = [1, 1, 1, 1];
  this.scaler = 0;
}

TTSequencing.startTest = function(notes) {
  return notes === 3 || notes === 7 || notes === 12 || notes === 14;
};

TTSequencing.prototype.setParams = function(_gt, _st, ms) {
  this.scaler = ms;
};

TTSequencing.prototype.completeSlip = function(msNow, notes) {
  if (this.slipCounter < MAX_SLIPS) {
    this.modParts[this.slipCounter] = this.constructModPart();
  }
  ++this.slipCounter;
  this.fizz.start(msNow, notes);
};

TTSequencing.prototype.advance = function(msNow, notes) {
  if (notes === 15) {
    if (this.fizz.slippinTillYaSlipsComeTrue) this.fizz.reset();
    return;
  }
  if (!this.fizz.slippinTillYaSlipsComeTrue) {
    if (TTSequencing.startTest(notes)) {
      this.fizz.start(msNow, notes);
    }
    return;
  }
  if (this.fizz.theSlipIsTheBoot(notes)) {
    this.fizz.grow(msNow, notes);
    if (this.fizz.slide === 5) {
      this.completeSlip(msNow, notes);
    }
  } else {
    this.fizz.reset();
  }
};

TTSequencing.prototype.reset = function() {
  this.slipCounter = 0;
  this.modParts = [1, 1, 1, 1];
};

TTSequencing.prototype.constructModPart = function() {
  return this.scaler;
};

// ─── TTSequencing2 (thing 2) ────────────────────────────────────────────

function TTSequencing2() {
  this.fizz = new TheSlip2();
  this.slipCounter = 0;
  this.modParts = [1, 1, 1, 1];
  this.scaler = 0;
}

TTSequencing2.startTest = function(notes) {
  return notes === 3 || notes === 12;
};

TTSequencing2.prototype.setParams = function(_gt, _st, ms) {
  this.scaler = ms;
};

TTSequencing2.prototype.completeSlip = function(msNow, notes) {
  if (this.slipCounter < MAX_SLIPS) {
    this.modParts[this.slipCounter] = this.constructModPart();
  }
  ++this.slipCounter;
  this.fizz.start(msNow, notes);
};

TTSequencing2.prototype.advance = function(msNow, notes) {
  if (notes === 15) {
    if (this.fizz.slippinTillYaSlipsComeTrue) this.fizz.reset();
    return;
  }
  if (!this.fizz.slippinTillYaSlipsComeTrue) {
    if (TTSequencing2.startTest(notes)) {
      this.fizz.start(msNow, notes);
    }
    return;
  }
  if (this.fizz.theSlipIsTheBoot(notes)) {
    this.fizz.grow(msNow, notes);
    if (this.fizz.slide === 5) {
      this.completeSlip(msNow, notes);
    }
  } else {
    this.fizz.reset();
  }
};

TTSequencing2.prototype.reset = function() {
  this.slipCounter = 0;
  this.modParts = [1, 1, 1, 1];
};

TTSequencing2.prototype.constructModPart = function() {
  return this.scaler;
};

// ─── TheThingMod ────────────────────────────────────────────────────────

function TheThingMod() {
  this.tt1 = new TTSequencing();
  this.tt2 = new TTSequencing2();
  this.minMod = 0.5;
  this.maxMod = 1.0;
  this.scaler1 = 0.7;
  this.scaler2 = 0.7;
}

TheThingMod.prototype.setup = function() {
  this.tt1.setParams(0, 0, this.scaler1);
  this.tt2.setParams(0, 0, this.scaler2);
};

TheThingMod.prototype.advanceSequencing = function(msNow, notes) {
  this.tt1.advance(msNow, notes);
  this.tt2.advance(msNow, notes);
};

TheThingMod.prototype.getModAndReset = function() {
  var pmod = 1.0;
  for (var i = 0; i < 4; i++) {
    pmod = Math.min(pmod, this.tt1.modParts[i]);
    pmod = Math.min(pmod, this.tt2.modParts[i]);
  }
  if (this.tt1.slipCounter === 0 && this.tt2.slipCounter === 0) {
    pmod = 1.0;
  }
  pmod = Math.max(this.minMod, Math.min(pmod, this.maxMod));
  this.tt1.reset();
  this.tt2.reset();
  return pmod;
};

TheThingMod.prototype.getModsAndReset = function() {
  var pmod1 = 1.0;
  var pmod2 = 1.0;
  for (var i = 0; i < 4; i++) {
    pmod1 = Math.min(pmod1, this.tt1.modParts[i]);
    pmod2 = Math.min(pmod2, this.tt2.modParts[i]);
  }
  if (this.tt1.slipCounter === 0) {
    pmod1 = 1.0;
  }
  if (this.tt2.slipCounter === 0) {
    pmod2 = 1.0;
  }
  pmod1 = Math.max(this.minMod, Math.min(pmod1, this.maxMod));
  pmod2 = Math.max(this.minMod, Math.min(pmod2, this.maxMod));
  this.tt1.reset();
  this.tt2.reset();
  return {
    theThing: pmod1,
    theThing2: pmod2,
  };
};
