declare module 'ggencoder' {
  export interface AisEncodeOptions {
    mmsi: string,
    accuracy?: number,
    aistype?: number,
    cargo?: string | undefined
    cog?: number | undefined,
    destination?: string | undefined,
    dimA?: number | undefined,
    dimB?: number | undefined,
    dimC?: number | undefined,
    dimD?: number | undefined,
    draught?: number | undefined,
    etaDay?: number | undefined,
    etaHr?: number | undefined,
    etaMin?: number | undefined,
    etaMo?: number | undefined,
    hdg?: number | undefined,
    imo?: string | undefined,
    lat?: number | undefined,
    lon?: number | undefined,
    own?: number | undefined,
    part?: number,
    repeat?: number,
    rot?: number,
    shipname?: string | undefined,
    smi?: number | undefined,
    sog?: number | undefined
  }

  export class AisEncode {
    constructor(options: AisEncodeOptions)
    nmea: string
  }
}