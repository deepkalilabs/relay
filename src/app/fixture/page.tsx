"use client";

import { useState } from "react";

export default function RecorderFixture() {
  const [submitted, setSubmitted] = useState(false);
  const navigateSpa = () => {
    history.pushState({ fixture: true }, "", "/fixture?view=details");
    dispatchEvent(new PopStateEvent("popstate"));
  };
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Recorder fixture</h1>
      <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <p><label>Email <input name="email" type="email" data-testid="email-input" /></label></p>
        <p><label>Password <input name="password" type="password" autoComplete="current-password" /></label></p>
        <p><label>Plan <select name="plan"><option value="free">Free</option><option value="pro">Professional</option></select></label></p>
        <p><label><input name="terms" type="checkbox" /> Accept terms</label></p>
        <button type="submit">Continue</button>
      </form>
      {submitted ? <p role="status">Submitted</p> : null}
      <button type="button" onClick={navigateSpa}>Open details</button>
      <button type="button" onClick={() => window.open("/fixture?popup=1", "_blank")}>Open popup</button>
      <iframe title="Payment frame" src="/fixture/frame" style={{ width: "100%", height: 120, marginTop: 20 }} />
    </main>
  );
}
