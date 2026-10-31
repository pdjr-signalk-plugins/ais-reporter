import { floor } from "lodash";

export class Endpoint {

  public app: any = undefined;
  public name: string = '';
  public ipAddress: string = '';
  public port: number = 0;
  public myAisReportClass: string = 'B';
  public enabled: boolean = true;
  public intervals: Intervals = <Intervals>{};
  public statistics: Statistics = <Statistics>{};

  constructor(options: any[], app: any) {

    if (!options[0].ipAddress) throw new Error('missing \'ipAddress\' property');
    if (!options[0].port) throw new Error('missing \'port\' property');


    this.app = app;
    this.name = options[0].name || options[0].ipAddress;
    this.ipAddress = options[0].ipAddress;
    this.port = options[0].port;
    this.myAisReportClass = getOption(options, 'myAisReportClass');
    this.intervals.positionUpdateIntervals = getOptionArray(options, 'positionUpdateInterval');
    this.intervals.staticUpdateIntervals = getOptionArray(options, 'staticUpdateInterval');
    this.intervals.myPositionUpdateIntervals = getOptionArray(options, 'myPositionUpdateInterval');
    this.intervals.myStaticUpdateIntervals = getOptionArray(options, 'myStaticUpdateInterval');
    this.intervals.navigationStateMap = getOption(options, 'navigationStateMap');
    this.statistics = {
      started: Date.now(),
      totalBytes: 0,
      position: {
        self: {
          reports: 0,
          bytes: 0
        },
        others: {
          reports: 0,
          bytes: 0
        }
      },
      static: {
        self: {
          reports: 0,
          bytes: 0
        },
        others: {
          reports: 0,
          bytes: 0
        }
      }
    }

    /**
     * 
     * @param objects - an array of arbitrary objects which may contain 'name'
     * @param name - the identifier of a property that may be contained in 'objects'
     * @param fallback - the value to be returned if 'name' is not found in any object.
     * @returns 
     */
    function getOption(options: any[], name: string): any {
      var retval: any = undefined;
      options.reverse().forEach((opt: any) => {
        if (opt.hasOwnProperty(name)) retval = opt[name];
      });
      return(retval);
    }
  
    function getOptionArray(options: any, name: string): any {
      var retval: any = undefined;
      options.reverse().forEach((opt: any) => {
        if (opt.hasOwnProperty(name)) retval = (Array.isArray(opt[name]))?opt[name]:[opt[name]];
      })
      return(retval);
    }
  }

  updateStatistics(spbt: number, ssbt: number, tpbt: number, tsbt: number) {
    this.statistics.totalBytes += (spbt + ssbt + tpbt + tsbt);
    this.statistics.position.self.bytes += spbt;
    this.statistics.position.others.bytes += tpbt;
    this.statistics.static.self.bytes += ssbt;
    this.statistics.static.others.bytes += tsbt;
  }

}

export type { ReportStatistics };

interface Intervals {
  positionUpdateIntervals: number[],
  staticUpdateIntervals: number[],
  myPositionUpdateIntervals: number[],
  myStaticUpdateIntervals: number[],
  navigationStateMap: any
}

interface Statistics {
  started: number | undefined,
  totalBytes: number,  
  position: ReportStatistics,
  static: ReportStatistics
}

interface ReportStatistics {
  self: {
    reports: number,
    bytes: number
  },
  others: {
    reports: number,
    bytes: number
  }
}