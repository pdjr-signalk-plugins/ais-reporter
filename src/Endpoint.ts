import { floor } from "lodash";

export class Endpoint {

  public app: any = undefined;
  /**
   * Name of the Endpoint, used only for reporting.
   */
  public name: string = '';
  /**
   * IP address of the remote endpoint.
   */
  public ipAddress: string = '';
  /**
   * Port number of the remote endpoint.
   */
  public port: number = 0;
  /**
   * Whether or not the Endpoint is active.
   */
  public enabled: boolean = true;
  /**
   * Configured intervals and related properties.
   */
  public intervals: Intervals = <Intervals>{};
  /**
   * Accumulated transmission statistics.
   */
  public statistics: Statistics = <Statistics>{};

  constructor(options: any[], app: any) {

    if (!options[0].ipAddress) throw new Error('missing \'ipAddress\' property');
    if (!options[0].port) throw new Error('missing \'port\' property');


    this.app = app;
    this.name = options[0].name || options[0].ipAddress;
    this.ipAddress = options[0].ipAddress;
    this.port = options[0].port;
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

    this.app.debug(`Endpoint[${this.ipAddress}:${this.port}]: creating endpoint "${this.name}"`);
  
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

  dump() {
    this.app.debug(`name: ${this.name}`);
    this.app.debug(`ipAddress: ${this.ipAddress}`);
    this.app.debug(`port: ${this.port}`);
    this.app.debug(`intervals: ${JSON.stringify(this.intervals)}`);
    this.app.debug(`statistics: ${JSON.stringify(this.statistics)}`);
  }

  updateStatistics(reportType: string, update: ReportStatistics) {
    this.statistics.totalBytes += (update.self.bytes + update.others.bytes);
    switch (reportType) {
      case 'position':
        this.statistics.position.self.reports += update.self.reports;
        this.statistics.position.self.bytes += update.self.bytes;
        this.statistics.position.others.reports += update.others.reports;
        this.statistics.position.others.bytes += update.others.bytes;
        break;
      case 'static':
        this.statistics.static.self.reports += update.self.reports;
        this.statistics.static.self.bytes += update.self.bytes;
        this.statistics.static.others.reports += update.others.reports;
        this.statistics.static.others.bytes += update.others.bytes;
        break;
      default:
        break;
    }
  }

}

export type { ReportStatistics };

interface Intervals {
  positionUpdateIntervals: number[],
  staticUpdateIntervals: number[],
  myPositionUpdateIntervals: number[],
  myStaticUpdateIntervals: number[],
  navigationStateMap: string[][]
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