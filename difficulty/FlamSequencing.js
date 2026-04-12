/**
 * FlamSequencing — port of HA_Sequencers/FlamSequencing.h from Etterna's MinaCalc.
 * Detects n > 1 taps close enough in time to be hit as a chord (flams).
 */

var MAX_FLAM_JAMMIES = 4;

// ─── Flam ───────────────────────────────────────────────────────────────

function Flam() {
  this.unsignedUnseen = 0;
  this.size = 1;
  this.flammin = false;
  this.ms = [0, 0, 0];
}

Flam.prototype.commaCommaCoolmeleon = function(notes) {
  return (this.unsignedUnseen & notes) === 0;
};

Flam.prototype.getDur = function() {
  switch (this.size) {
    case 2: return this.ms[0];
    case 3: return this.ms[0] + this.ms[1];
    case 4: return this.ms[0] + this.ms[1] + this.ms[2];
    default: return 0;
  }
};

Flam.prototype.start = function(msNow, notes) {
  this.flammin = true;
  this.unsignedUnseen = 0;
  this.grow(msNow, notes);
};

Flam.prototype.grow = function(msNow, notes) {
  if (this.size === MAX_FLAM_JAMMIES) return;
  this.unsignedUnseen |= notes;
  this.ms[this.size - 1] = msNow;
  ++this.size;
};

Flam.prototype.reset = function() {
  this.flammin = false;
  this.size = 1;
};

// ─── FJSequencer ────────────────────────────────────────────────────────

function FJSequencer() {
  this.flim = new Flam();
  this.groupTol = 0;
  this.stepTol = 0;
  this.modScaler = 0;
  this.flamCounter = 0;
  this.modParts = [1, 1, 1, 1];
  this.theFifthFlammament = false;
}

FJSequencer.prototype.setParams = function(gt, st, ms) {
  this.groupTol = gt;
  this.stepTol = st;
  this.modScaler = ms;
};

FJSequencer.prototype.completeSeq = function() {
  if (this.flamCounter < MAX_FLAM_JAMMIES) {
    this.modParts[this.flamCounter] = this.constructModPart();
    ++this.flamCounter;
  } else {
    this.theFifthFlammament = true;
  }
  this.flim.reset();
};

FJSequencer.prototype.flamminColCheck = function(notes) {
  return this.flim.commaCommaCoolmeleon(notes);
};

FJSequencer.prototype.flamminTolCheck = function(msNow) {
  if (msNow > this.groupTol) return false;
  if (this.flim.getDur() + msNow > this.groupTol) return false;
  return true;
};

FJSequencer.prototype.advance = function(msNow, notes) {
  if (this.theFifthFlammament) return;
  if (!this.flim.flammin) {
    if (msNow > this.stepTol) return;
    this.flim.start(msNow, notes);
  } else {
    if (this.flamminTolCheck(msNow)) {
      if (this.flamminColCheck(notes)) {
        this.flim.grow(msNow, notes);
      } else {
        this.completeSeq();
        this.flim.start(msNow, notes);
      }
    } else {
      this.completeSeq();
    }
  }
};

FJSequencer.prototype.handleIntervalEnd = function() {
  this.theFifthFlammament = false;
  this.flamCounter = 0;
  this.modParts = [1, 1, 1, 1];
};

FJSequencer.prototype.constructModPart = function() {
  var dur = this.flim.getDur();
  var durProp = dur / this.groupTol;
  durProp /= (this.flim.size / this.modScaler);
  durProp = Math.max(0, Math.min(durProp, 1));
  return Math.sqrt(durProp);
};

// ─── FlamJamMod ─────────────────────────────────────────────────────────

function FlamJamMod() {
  this.fj = new FJSequencer();
  this.minMod = 0.3;
  this.maxMod = 1.0;
  this.scaler = 0.001;
  this.base = 0.5;
  this.groupTol = 35.0;
  this.stepTol = 17.5;
}

FlamJamMod.prototype.setup = function() {
  this.fj.setParams(this.groupTol, this.stepTol, this.scaler);
};

FlamJamMod.prototype.advanceSequencing = function(msNow, notes) {
  this.fj.advance(msNow, notes);
};

FlamJamMod.prototype.getModAndReset = function() {
  if (this.fj.modParts[0] === 1) {
    this.fj.handleIntervalEnd();
    return 1.0;
  }
  var pmod = 1.0;
  for (var i = 0; i < this.fj.modParts.length; i++) {
    pmod += this.fj.modParts[i];
  }
  pmod /= 5.0;
  pmod = Math.max(this.minMod, Math.min(this.base + pmod, this.maxMod));
  this.fj.handleIntervalEnd();
  return pmod;
};
