"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sk2Ais = void 0;
class Sk2Ais {
    static mps2kn(mps) {
        return ((mps || 0) * 1.9438444924574);
    }
    static rads2deg(radians, fallback) {
        return ((radians) ? ((radians * 180) / Math.PI) : fallback);
    }
    static accuracy(dilution) {
        return (((dilution || 100) < 5) ? 1 : 0);
    }
    static smi(label) {
        switch (label) {
            case 'Not available': return (0);
            case 'No special maneuver': return (1);
            case 'Special maneuver': return (2);
            default: return (0);
        }
    }
    static navstatus(state) {
        var retval = 15;
        switch (state) {
            case 'sailing': return (8);
            case 'motoring': return (0);
            case 'anchored': return (1);
            case 'moored': return (5);
            default: return (15);
        }
    }
    static rot(rps) {
        var retval = 128; // no turn data available
        if (rps) {
            var sign = (rps < 0) ? -1 : 1;
            var dpm = (Math.abs(rps) * 3437.7468);
            retval = Math.sqrt((dpm < 708) ? Math.round(dpm) : 126) * 4.733;
            retval = ((retval > 126) ? 126 : retval) * sign;
        }
        return (retval);
    }
    static shipname(name) {
        return ((name) ? name : '');
    }
    static shiptype(type) {
        return ((type) ? type : 0);
    }
    static callsign(callsign) {
        return ((callsign) ? callsign : '');
    }
    static imo(imo) {
        return ((imo) ? imo : '');
    }
    static etaDay(date) {
        var retval = 0;
        if (date) {
            try {
                retval = parseInt(date.slice(8, 2), 10);
            }
            catch (e) { }
        }
        return (retval);
    }
    static etaHr(date) {
        var retval = 24;
        if (date) {
            try {
                retval = parseInt(date.slice(11, 2), 10);
            }
            catch (e) { }
        }
        return (retval);
    }
    static etaMo(date) {
        var retval = 0;
        if (date) {
            try {
                retval = parseInt(date.slice(5, 2), 10);
            }
            catch (e) { }
        }
        return (retval);
    }
    static etaMin(date) {
        var retval = 60;
        if (date) {
            try {
                retval = parseInt(date.slice(14, 2), 10);
            }
            catch (e) { }
        }
        return (retval);
    }
    static destination(destination) {
        return ((destination) ? destination : '');
    }
}
exports.Sk2Ais = Sk2Ais;
