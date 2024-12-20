export class Endpoint {

  public name: string = '';
  public ipAddress: string = '';
  public port: number = 0;
  public myVessel: Vessel = <Vessel>{};
  public otherVessels: Vessel = <Vessel>{};
  public statistics: Statistics = <Statistics>{};

  constructor(option: any, options: any, defaults: any) {
    if (!option.ipAddress) throw new Error('missing \'ipAddress\' property');
    if (!option.port) throw new Error('missing \'port\' property');

    this.name = options.name || option.ipAddress;
    this.ipAddress = option.ipAddress;
    this.port = option.port;
    this.myVessel = <Vessel>{};
    this.myVessel.expiryInterval = getOption([(option.myVessel || {}),option,(options.myVessel || {}),options], 'expiryInterval', defaults.EXPIRY_INTERVAL);
    this.myVessel.positionUpdateIntervals = getOptionArray([(option.myVessel || {}),option,(options.myVessel || {}),options], 'positionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
    this.myVessel.staticUpdateIntervals = getOptionArray([(option.myVessel || {}),option,(options.myVessel || {}),,options], 'staticUpdateInterval', [defaults.STATIC_DATA_UPDATE_INTERVAL]);
    this.myVessel.updateIntervalIndexPath = getOption([(option.myVessel || {}),option,(options.myVessel || {}),options], 'updateIntervalIndexPath', undefined);
    this.otherVessels = <Vessel>{};
    this.otherVessels.expiryInterval = getOption([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'expiryInterval', defaults.EXPIRY_INTERVAL);
    this.otherVessels.positionUpdateIntervals = getOptionArray([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'positionUpdateInterval', [defaults.POSITION_UPDATE_INTERVAL]);
    this.otherVessels.staticUpdateIntervals = getOptionArray([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'staticUpdateInterval', [defaults.STATIC_DATA_UPDATE_INTERVAL]);
    this.otherVessels.updateIntervalIndexPath = getOption([(option.otherVessels || {}),option,(options.otherVessels || {}),options], 'updateIntervalIndexPath', undefined);
    this.statistics = <Statistics>{};
    this.statistics.started = Date.now();
    this.statistics.totalBytesTransmitted = 0;
    this.statistics.position.self = { totalReports: 0, totalBytes: 0 };
    this.statistics.position.others = { totalReports: 0, totalBytes: 0 };
    this.statistics.static.self = { totalReports: 0, totalBytes: 0 };
    this.statistics.static.others = { totalReports: 0, totalBytes: 0 };
  
    function getOption(objects: any[], name: string, fallback: any): any {
      if (objects.length == 0) {
        return(fallback);
      } else {
        if (objects[0][name] !== undefined) {
          return(objects[0][name]);
        } else {
          return(getOption(objects.slice(1), name, fallback));
        }
      }
    }
  
    function getOptionArray(objects: any[], name: string, fallback: any): any {
      if (objects.length == 0) {
        return(fallback);
      } else {
        if (objects[0][name] !== undefined) {
          return((Array.isArray(objects[0][name]))?objects[0][name]:[objects[0][name]]);
        } else {
          return(getOptionArray(objects.slice(1), name, fallback));
        }
      }
    }
  }

}

interface Vessel {
  expiryInterval: number,
  positionUpdateIntervals: number[],
  staticUpdateIntervals: number[],
  updateIntervalIndexPath: string,
}

interface Statistics {
  started: number | undefined,
  totalBytesTransmitted: number,  
  position: ReportStatistics,
  static: ReportStatistics
}

interface ReportStatistics {
  self: {
    totalReports: number,
    totalBytes: number
  },
  others: {
    totalReports: number,
    totalBytes: number
  }
}