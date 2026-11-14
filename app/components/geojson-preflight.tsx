"use client";
import { useState } from "react";
import {
  inspectGeojson,
  MAX_GEOJSON_BYTES,
  type GeojsonPreflight,
} from "@/lib/geojson-preflight";

type Report = {
  filename: string;
  sourceName: string;
  sourceUrl: string;
  collectedAt: string;
  license: string;
  checkedAt: string;
  result: GeojsonPreflight;
};
export default function GeojsonPreflightTool() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function check(form: FormData) {
    setReport(null);
    setError("");
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > MAX_GEOJSON_BYTES
    ) {
      setError("Choose a non-empty GeoJSON file up to 5 MiB.");
      return;
    }
    const sourceName = String(form.get("sourceName") ?? "").trim();
    const license = String(form.get("license") ?? "").trim();
    if (!sourceName || !license) {
      setError("Enter a source name and license or permission.");
      return;
    }
    setBusy(true);
    try {
      const input: unknown = JSON.parse(await file.text());
      setReport({
        filename: file.name,
        sourceName,
        sourceUrl: String(form.get("sourceUrl") ?? "").trim(),
        collectedAt: String(form.get("collectedAt") ?? ""),
        license,
        checkedAt: new Date().toISOString(),
        result: inspectGeojson(input),
      });
    } catch {
      setError("The file could not be read as valid JSON.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!report) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...report,
            notice: "Preflight only. Not an approved or imported dataset.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "accraflow-geojson-preflight.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel geo-preflight">
      <h2>GeoJSON preflight</h2>
      <p>
        Check a locally selected dataset and record its source details. The file
        stays in your browser; this does not import or approve assets.
      </p>
      <form
        onChange={() => {
          setReport(null);
          setError("");
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void check(new FormData(event.currentTarget));
        }}
      >
        <label>
          GeoJSON file (maximum 5 MiB)
          <input
            type="file"
            name="file"
            accept=".geojson,.json,application/geo+json,application/json"
            required
            disabled={busy}
          />
        </label>
        <div className="geo-preflight-grid">
          <label>
            Source name
            <input name="sourceName" required maxLength={160} disabled={busy} />
          </label>
          <label>
            Source URL (optional)
            <input
              name="sourceUrl"
              type="url"
              maxLength={1000}
              disabled={busy}
            />
          </label>
          <label>
            Collection or survey date
            <input name="collectedAt" type="date" required disabled={busy} />
          </label>
          <label>
            License or permission
            <input name="license" required maxLength={300} disabled={busy} />
          </label>
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Checking…" : "Check GeoJSON"}
        </button>
      </form>
      {error && (
        <p className="geo-error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className="geo-result" aria-live="polite">
          <h3>
            {report.result.errorCount
              ? "Preflight found errors"
              : "Structural preflight passed"}
          </h3>
          <p>
            {report.filename} · {report.result.featureCount} feature
            {report.result.featureCount === 1 ? "" : "s"} ·{" "}
            {report.result.positionCount} position
            {report.result.positionCount === 1 ? "" : "s"} checked
          </p>
          <p>
            {Object.entries(report.result.geometryTypes)
              .map(([type, count]) => `${type}: ${count}`)
              .join(" · ") || "No supported geometries checked"}
          </p>
          {report.result.errorCount > 0 && (
            <>
              <strong>
                {report.result.errorCount} error
                {report.result.errorCount === 1 ? "" : "s"}
              </strong>
              <ul>
                {report.result.errors.map((issue, index) => (
                  <li key={index}>
                    {issue.feature ? `Feature ${issue.feature}: ` : ""}
                    {issue.message}
                  </li>
                ))}
              </ul>
              {report.result.errorCount > report.result.errors.length && (
                <p>
                  Only the first {report.result.errors.length} errors are shown.
                </p>
              )}
            </>
          )}
          {report.result.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button type="button" className="secondary" onClick={download}>
            Download preflight report
          </button>
        </div>
      )}
    </section>
  );
}
