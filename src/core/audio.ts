export function holdGainAtTime(parameter: AudioParam, time: number): void {
  if (typeof parameter.cancelAndHoldAtTime === 'function') {
    parameter.cancelAndHoldAtTime(time);
    return;
  }
  const currentValue = parameter.value;
  parameter.cancelScheduledValues(time);
  parameter.setValueAtTime(currentValue, time);
}
