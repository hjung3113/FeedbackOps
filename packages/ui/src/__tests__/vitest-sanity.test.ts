// Runner-health probe: verifies vitest is wired and globals are available.
// If this test ever fails, the test harness itself is broken — do not delete.
describe('vitest-sanity', () => {
  it('runner is alive', () => {
    expect(1).toBe(1); // GREEN: runner-health probe
  });
});
