import { describe, expect, it } from "vitest";
import { confidenceFromStored, decide, rankDomains, scoreDomain, type DomainSimilarity } from "./vocab-classify.ts";
import { VOCAB_CONFIG } from "./vocab-config.ts";

const ML = "ml";
const DL = "dl"; // branch of ML
const NLP = "nlp"; // branch of ML
const STAT = "stat";
const MATH = "math";

const sim = (domainId: string, protoSim: number, centroidSim: number | null = null): DomainSimilarity => ({
  domainId,
  parentId: domainId === DL || domainId === NLP ? ML : null,
  protoSim,
  centroidSim,
});

describe("scoreDomain", () => {
  it("uses the prototype alone while there is no centroid", () => {
    expect(scoreDomain(sim(STAT, 0.42))).toBe(0.42);
  });

  it("blends prototype and centroid with PROTO_WEIGHT", () => {
    expect(scoreDomain(sim(STAT, 0.4, 0.6))).toBeCloseTo(VOCAB_CONFIG.PROTO_WEIGHT * 0.4 + (1 - VOCAB_CONFIG.PROTO_WEIGHT) * 0.6, 10);
    expect(scoreDomain(sim(STAT, 0.4, 0.6), { PROTO_WEIGHT: 1 })).toBe(0.4);
  });
});

describe("rankDomains", () => {
  it("sorts by score and does not depend on input order", () => {
    const a = rankDomains([sim(STAT, 0.5), sim(MATH, 0.5), sim(ML, 0.7)]).map((d) => d.domainId);
    const b = rankDomains([sim(ML, 0.7), sim(MATH, 0.5), sim(STAT, 0.5)]).map((d) => d.domainId);
    expect(a).toEqual([ML, MATH, STAT]);
    expect(b).toEqual(a);
  });
});

describe("decide", () => {
  it("assigns the best domain when it is high enough and clearly ahead", () => {
    const decision = decide([sim(STAT, 0.55), sim(MATH, 0.4), sim(ML, 0.35)]);
    expect(decision).toMatchObject({ domainId: STAT, source: "auto", confidence: "tinggi" });
    expect(decision.top).toEqual([
      { domain_id: STAT, score: 0.55 },
      { domain_id: MATH, score: 0.4 },
      { domain_id: ML, score: 0.35 },
    ]);
  });

  it("stays pending when the two best unrelated domains are too close", () => {
    const decision = decide([sim(STAT, 0.5), sim(MATH, 0.49), sim(ML, 0.2)]);
    expect(decision).toMatchObject({ domainId: null, source: "pending", confidence: "rendah" });
    expect(decision.top.map((s) => s.domain_id)).toEqual([STAT, MATH, ML]);
  });

  it("stays pending when even the best score is low", () => {
    expect(decide([sim(STAT, 0.25), sim(MATH, 0.05)])).toMatchObject({
      domainId: null,
      source: "pending",
      confidence: "rendah",
    });
  });

  it("does not let a field and its own branch block each other", () => {
    // Deep Learning and Machine Learning are nearly tied, but they are parent and
    // branch; the real rival is Statistika, far behind.
    expect(decide([sim(DL, 0.52), sim(ML, 0.51), sim(STAT, 0.3)])).toMatchObject({ domainId: DL, source: "auto" });
    expect(decide([sim(ML, 0.52), sim(DL, 0.51), sim(STAT, 0.3)])).toMatchObject({ domainId: ML, source: "auto" });
  });

  it("still asks when a rival outside the parent/branch pair is close", () => {
    expect(decide([sim(DL, 0.52), sim(ML, 0.51), sim(STAT, 0.505)])).toMatchObject({ domainId: null, source: "pending" });
  });

  it("treats two branches of the same field as rivals", () => {
    expect(decide([sim(DL, 0.5), sim(NLP, 0.49), sim(ML, 0.3)])).toMatchObject({ domainId: null, source: "pending" });
  });

  it("assigns the only domain when it is high enough", () => {
    expect(decide([sim(STAT, 0.4)])).toMatchObject({ domainId: STAT, source: "auto", confidence: "tinggi" });
  });

  it("is pending with nothing to compare against", () => {
    expect(decide([])).toEqual({ domainId: null, source: "pending", confidence: "rendah", top: [] });
  });

  it("uses the thresholds exactly at their boundaries", () => {
    const config = { ...VOCAB_CONFIG, AUTO_MIN_SCORE: 0.3, AUTO_MIN_MARGIN: 0.05, CONFIDENCE_MEDIUM_MARGIN: 0.05 };
    expect(decide([sim(STAT, 0.3), sim(MATH, 0.25)], config)).toMatchObject({ source: "auto", confidence: "sedang" });
    expect(decide([sim(STAT, 0.3), sim(MATH, 0.26)], config)).toMatchObject({ source: "pending" });
    expect(decide([sim(STAT, 0.29), sim(MATH, 0.1)], config)).toMatchObject({ source: "pending" });
  });

  it("lets the centroid of confirmed terms change the outcome", () => {
    // By prototype alone Matematika wins; the terms already confirmed in Statistika pull it there.
    const decision = decide([sim(MATH, 0.5), sim(STAT, 0.46, 0.7)]);
    expect(decision).toMatchObject({ domainId: STAT, source: "auto" });
  });

  it("keeps only the top scores, rounded to four decimals", () => {
    const decision = decide([sim("a", 0.123456), sim("b", 0.1), sim("c", 0.09), sim("d", 0.08)]);
    expect(decision.top).toHaveLength(VOCAB_CONFIG.TOP_SCORES_KEPT);
    expect(decision.top[0]).toEqual({ domain_id: "a", score: 0.1235 });
  });
});

describe("confidenceFromStored", () => {
  const parentOf = (id: string) => (id === DL || id === NLP ? ML : null);

  it("labels by the margin over the closest rival", () => {
    expect(confidenceFromStored([{ domain_id: STAT, score: 0.6 }, { domain_id: MATH, score: 0.4 }], parentOf)).toBe("tinggi");
    expect(confidenceFromStored([{ domain_id: STAT, score: 0.6 }, { domain_id: MATH, score: 0.55 }], parentOf)).toBe("sedang");
    expect(confidenceFromStored([{ domain_id: STAT, score: 0.6 }, { domain_id: MATH, score: 0.59 }], parentOf)).toBe("rendah");
  });

  it("ignores the parent/branch pair when looking for the rival", () => {
    expect(
      confidenceFromStored(
        [
          { domain_id: DL, score: 0.6 },
          { domain_id: ML, score: 0.59 },
          { domain_id: STAT, score: 0.3 },
        ],
        parentOf,
      ),
    ).toBe("tinggi");
  });

  it("is low for missing, empty or weak scores", () => {
    expect(confidenceFromStored(null, parentOf)).toBe("rendah");
    expect(confidenceFromStored([], parentOf)).toBe("rendah");
    expect(confidenceFromStored([{ domain_id: STAT, score: 0.1 }], parentOf)).toBe("rendah");
  });
});
