function perlin_fluctuation(
  time: number,
  hash: number,
  center: number,
  amplitude: number,
  frequency: number
): number {
  return center + amplitude * Math.sin(time * frequency + hash);
}

export class EssBatterySimulator {
  private readonly hashNum = 12345;

  private simulateTempature(currentTime: Date): number {
    return perlin_fluctuation(
      currentTime.valueOf(),
      this.hashNum,
      35,
      25,
      0.3
    );
  }

  async simulate(currentTime: Date) {
    const temperature = this.simulateTempature(currentTime);
    return { temperature };
  }
}
