export declare class Sk2Ais {
    static mps2kn(mps: number | undefined): number;
    static rads2deg(radians: number | undefined, fallback: number): number;
    static accuracy(dilution: number | undefined): number;
    static smi(label: string | undefined): number;
    static navstatus(state: string | undefined): number;
    static rot(rps: number | undefined): number;
    static shipname(name: string | undefined): string;
    static shiptype(type: number | undefined): number;
    static callsign(callsign: string | undefined): string;
    static imo(imo: string | undefined): string;
    static etaDay(date: string | undefined): number;
    static etaHr(date: string | undefined): number;
    static etaMo(date: string | undefined): number;
    static etaMin(date: string | undefined): number;
    static destination(destination: string | undefined): string;
}
