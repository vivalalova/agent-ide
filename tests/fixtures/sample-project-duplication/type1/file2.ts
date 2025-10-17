export class Device2Simulator {
  async simulate(currentTime: Date, meterData: any) {
    return meterData;
  }

  async referenceData(currentTime: Date, meterData: any) {
    return this.simulate(currentTime, meterData);
  }
}
