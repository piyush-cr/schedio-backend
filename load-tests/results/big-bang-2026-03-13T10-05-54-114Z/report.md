# Schedio Load Test Report

- **Run ID**: big-bang-2026-03-13T10-05-54-114Z
- **Target**: http://localhost:3000
- **VUs**: 5000
- **Total Requests Target**: 1000000
- **Token Mode**: login
- **Duration (sec)**: 494.47

## Summary

- **Total Requests**: 1008502
- **Success Rate**: 12.5%
- **RPS**: 2040.37
- **Avg (ms)**: 2919.05
- **P95 (ms)**: 5536
- **P99 (ms)**: 9552

## Status Code Breakdown

```json
{
  "200": 126036,
  "401": 441233,
  "429": 441233
}
```

## Notes

- If **429** is high, you are hitting rate limiting (expected if testing limiter).
- If **5xx** or **0/timeouts** are high, the backend (or DB/Redis) is saturating or crashing under load.

Artifacts:
- JSON: `load-tests\results\big-bang-2026-03-13T10-05-54-114Z\report.json`
- MD: `load-tests\results\big-bang-2026-03-13T10-05-54-114Z\report.md`