export class Device1Simulator {
  async simulate(currentTime: Date, meterData: any) {
    return meterData;
  }

  async referenceData(currentTime: Date, meterData: any) {
    return this.simulate(currentTime, meterData);
  }
}
