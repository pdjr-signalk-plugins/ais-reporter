export class Sk2Ais {

  static mps2kn(mps: number | undefined): number {
    return((mps || 0) * 1.9438444924574);
  }

  static rads2deg(radians: number | undefined, fallback: number): number {
    return((radians)?((radians * 180) / Math.PI):fallback);
  }

  static accuracy(dilution: number | undefined): number {
    return(((dilution || 100) < 5)?1:0);
  }

  static smi(label: string | undefined): number {
    switch (label) {
      case 'Not available': return(0);
      case 'No special maneuver': return(1);
      case 'Special maneuver': return(2);
      default: return(0);
    }
  }

  static navstatus(state: string | undefined): number {
    var retval: number = 15;
    switch (state) {
      case 'sailing' : return(8);
      case 'motoring' : return(0);
      case 'anchored' : return(1);
      case 'moored': return(5);
      default: return(15);
    }
  }

  static rot(rps: number | undefined): number {
    var retval = 128; // no turn data available
    if (rps) {
      var sign: number = (rps < 0)?-1:1;
      var dpm = (Math.abs(rps) * 3437.7468);
      retval = Math.sqrt((dpm < 708)?Math.round(dpm):126) * 4.733;
      retval = ((retval > 126)?126:retval) * sign;
    }
    return(retval);
  }

  static shipname(name: string | undefined): string {
    return((name)?name:'');
  }

  static shiptype(type: number | undefined): number {
    return((type)?type:0);
  }

  static callsign(callsign: string | undefined): string {
    return((callsign)?callsign:'');
  }

  static imo(imo: string | undefined): string {
    return((imo)?imo:'');
  }

  static etaDay(date: string | undefined) : number {
    var retval: number = 0;
    if (date) {
      try { retval = parseInt(date.slice(8, 2), 10); } catch(e) { }
    }
    return(retval);
  }

  static etaHr(date: string | undefined) : number {
    var retval: number = 24;
    if (date) {
      try { retval = parseInt(date.slice(11, 2), 10); } catch(e) { }
    }
    return(retval);
  }

  static etaMo(date: string | undefined) : number {
    var retval: number = 0;
    if (date) {
      try { retval = parseInt(date.slice(5, 2), 10); } catch(e) { }
    }
    return(retval);
  }

  static etaMin(date: string | undefined): number {
    var retval: number = 60;
    if (date) {
      try { retval = parseInt(date.slice(14, 2), 10); } catch (e) { }
    }
    return(retval);
  }

  static destination(destination: string | undefined): string {
    return((destination)?destination:'');
  }




}