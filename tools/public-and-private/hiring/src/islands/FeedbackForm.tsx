import { call, toast } from "@argentic/chest-app/client";
import { useState } from "react";
import { useWork } from "../components/use-work.ts";
import type { Catalogue } from "../i18n/index.ts";
import { limits, recommendations, type Recommendation } from "../shared/model.ts";

type Feedback = { rating: number; strengths: string; concerns: string; recommendation: Recommendation };

// Structured feedback (a 1–4 rating, strengths, concerns, hire or not):
// an interviewer's on a candidate of a job they are on, or a recruiter's.
type FeedbackWords = { candidate: Catalogue["candidate"]; empty: string };

export function FeedbackForm({ candidateId, mine, t }: { candidateId: string; mine: Feedback | null; t: FeedbackWords }) {
  const [pending, start] = useWork();
  const [rating, setRating] = useState<number>(mine?.rating ?? 0);
  const [recommendation, setRecommendation] = useState<string>(mine?.recommendation ?? "");
  const [error, setError] = useState<string | null>(null);
  const w = t.candidate;
  const ratingWords = [w.ratings.r1, w.ratings.r2, w.ratings.r3, w.ratings.r4];
  return (
    <form className="stack feedback-form" onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      if (!rating || !recommendation) return setError(t.empty);
      setError(null);
      start(async () => {
        const r = await call("giveFeedback", { id: candidateId, rating, recommendation: recommendation as Recommendation, strengths: String(data.get("strengths") ?? ""), concerns: String(data.get("concerns") ?? "") }, { quiet: true });
        if (!r.ok) return setError(r.message);
        toast(w.feedbackSaved);
      });
    }}>
      <fieldset className="choices">
        <legend className="label">{w.rating}</legend>
        <div className="scale">
          {ratingWords.map((word, i) => (
            <label key={i} className={`scale-step s${i + 1}${rating === i + 1 ? " on" : ""}`}>
              <input type="radio" name="rating" value={i + 1} checked={rating === i + 1} onChange={() => setRating(i + 1)} required />
              <span className="scale-n">{i + 1}</span>
              <span className="scale-word">{word}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="two">
        <div className="field-block">
          <label className="label" htmlFor={`strengths-${candidateId}`}>{w.strengths}</label>
          <textarea id={`strengths-${candidateId}`} name="strengths" className="field" rows={4} maxLength={limits.feedbackText} defaultValue={mine?.strengths ?? ""} />
        </div>
        <div className="field-block">
          <label className="label" htmlFor={`concerns-${candidateId}`}>{w.concerns}</label>
          <textarea id={`concerns-${candidateId}`} name="concerns" className="field" rows={4} maxLength={limits.feedbackText} defaultValue={mine?.concerns ?? ""} />
        </div>
      </div>
      <p className="hint">{w.feedbackHint}</p>
      <fieldset className="choices">
        <legend className="label">{w.recommendation}</legend>
        <div className="reco">
          {recommendations.map(r => (
            <label key={r} className={`pill reco-${r}${recommendation === r ? " on" : ""}`}>
              <input type="radio" name="recommendation" value={r} checked={recommendation === r} onChange={() => setRecommendation(r)} required />
              <span>{w.recommendations[r]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={pending}>{mine ? w.updateFeedback : w.sendFeedback}</button>
      </div>
    </form>
  );
}

