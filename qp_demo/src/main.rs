// =============================================================================
// EDMS — Duplicate E(Q, P, H) Detection Algorithm Demo
//
// Task: Prevent writing a duplicate E(Q,P,H) to disk / History
//
// E = one test run = (Q, P, H) where
//   Q = Request  JSON  {"method":"GET", "url":"...", "body":{}}
//   P = Response JSON  {"status":200, "body":{...}}
//   H = Headers  JSON  {"Content-Type":"application/json", ...}
//
// Duplicate rule: if ANY of Q, P, H differs by even one character → different E
//
// This file compares three approaches and picks the best one.
// Run:  cargo run
// Test: cargo test
// =============================================================================

use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 1 — Raw string comparison (NAIVE / BROKEN)
//
// Problem: {"a":1,"b":2} and {"b":2,"a":1} are the same JSON but different
//          strings → would be treated as two different Es. WRONG.
// ─────────────────────────────────────────────────────────────────────────────
fn approach1_naive_key(q: &str, p: &str, h: &str) -> String {
    format!("{}|{}|{}", q, p, h)
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 2 — Normalize JSON → SHA-256 → HashSet  ← RECOMMENDED
//
// Steps:
//   1. Parse Q, P, H as JSON values
//   2. Normalize: recursively sort all object keys alphabetically (BTreeMap)
//   3. Serialize back to compact canonical string
//   4. Combine: canonical_Q + "|" + canonical_P + "|" + canonical_H
//   5. SHA-256 hash → always 32 bytes / 64 hex chars, regardless of input size
//   6. Check HashSet → O(1) lookup
//
// Why sort keys?
//   JSON objects have NO guaranteed key order.
//   {"a":1,"b":2}  and  {"b":2,"a":1}  are the same data but different strings.
//   Sorting fixes this: both → {"a":1,"b":2}
//
// Why SHA-256?
//   Response bodies can be megabytes. Storing the raw string in a HashSet wastes RAM.
//   SHA-256 always produces 32 bytes regardless of input size.
//   Collision probability ≈ 1 in 2^256 — effectively zero.
//
// Why HashSet and NOT Bloom Filter?
//   Bloom Filter: space-efficient, but has FALSE POSITIVES.
//   False positive here = we say "duplicate" for something that is actually NEW.
//   Result = a legitimate new QP is silently blocked. Data loss. Unacceptable.
//
//   HashSet: exact, no false positives, no false negatives.
//   Memory cost: 64 bytes per entry (SHA-256 hex string).
//   For 10,000 runs: 640 KB RAM. Completely acceptable.
//
//   VERDICT: HashSet wins. Correctness > marginal memory saving.
// ─────────────────────────────────────────────────────────────────────────────

/// Step 1+2: Recursively normalize a serde_json::Value by sorting object keys.
fn normalize(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            // BTreeMap sorts keys alphabetically automatically
            let sorted: BTreeMap<String, Value> = map
                .iter()
                .map(|(k, v)| (k.clone(), normalize(v)))
                .collect();
            let mut result = Map::new();
            for (k, v) in sorted {
                result.insert(k, v);
            }
            Value::Object(result)
        }
        // Arrays keep order — [1,2,3] ≠ [3,2,1]
        Value::Array(arr) => Value::Array(arr.iter().map(normalize).collect()),
        // Numbers, strings, booleans, null → unchanged
        other => other.clone(),
    }
}

/// Step 3: Parse → Normalize → Serialize to canonical compact JSON string.
fn canonical(json: &str) -> Result<String, String> {
    let v: Value = serde_json::from_str(json).map_err(|e| e.to_string())?;
    serde_json::to_string(&normalize(&v)).map_err(|e| e.to_string())
}

/// Step 4+5: Build the SHA-256 hash key for one E(Q,P,H).
fn make_hash_key(q: &str, p: &str, h: &str) -> Result<String, String> {
    let canon_q = canonical(q)?;
    let canon_p = canonical(p)?;
    let canon_h = canonical(h)?;

    // Combine with a separator that can't appear in JSON values
    let combined = format!("{}\x00{}\x00{}", canon_q, canon_p, canon_h);

    let mut hasher = Sha256::new();
    hasher.update(combined.as_bytes());
    Ok(hex::encode(hasher.finalize()))
}

/// Step 6: Check membership and insert if new.
/// Returns true = DUPLICATE (blocked), false = NEW (allowed to write to disk).
fn check_duplicate(seen: &mut HashSet<String>, q: &str, p: &str, h: &str) -> bool {
    let key = match make_hash_key(q, p, h) {
        Ok(k) => k,
        Err(_) => return false, // invalid JSON → let it through, not our problem
    };
    if seen.contains(&key) {
        true // duplicate
    } else {
        seen.insert(key);
        false // new entry
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROACH 3 — Bloom Filter (analysis only, not used)
//
// A Bloom Filter uses k hash functions + a bit array.
// Lookup: O(k) time, O(m) space where m = bit array size.
//
// PROS:  ~10x smaller than HashSet for the same number of entries.
// CONS:  False positive rate (FPR) — says "already seen" when it's actually new.
//        With m=1MB bit array and 10,000 entries: FPR ≈ 0.01% (1 in 10,000).
//        That means: roughly 1 out of every 10,000 REAL new QPs gets blocked.
//
// For EDMS:
//   - QPs rarely go above 10-20 per endpoint.
//   - Even across all endpoints: total QPs ≈ few thousand max.
//   - HashSet at 64 bytes/entry × 10,000 = 640 KB — totally fine.
//   - A 0.01% false positive rate means real data loss. NOT acceptable.
//
// CONCLUSION: Use HashSet. Bloom Filter would only be worth it if we had
//             millions of entries AND RAM was critically scarce.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — realistic EDMS test scenarios
// ─────────────────────────────────────────────────────────────────────────────

struct Scenario {
    name: &'static str,
    q: &'static str,
    p: &'static str,
    h: &'static str,
    expect_duplicate: bool,
    note: &'static str,
}

fn mock_scenarios() -> Vec<Scenario> {
    vec![
        // ── Run 1: First ever run for GET /users ──────────────────────────
        Scenario {
            name: "Run 1 — First GET /users",
            q: r#"{"method":"GET","url":"https://dummyjson.com/users","body":{}}"#,
            p: r#"{"status":200,"body":{"total":208,"users":[{"id":1,"name":"Terry"}]}}"#,
            h: r#"{"Content-Type":"application/json","X-Request-Id":"abc123"}"#,
            expect_duplicate: false,
            note: "New entry — should be written to disk",
        },
        // ── Run 2: Exact same → DUPLICATE ────────────────────────────────
        Scenario {
            name: "Run 2 — Exact same as Run 1",
            q: r#"{"method":"GET","url":"https://dummyjson.com/users","body":{}}"#,
            p: r#"{"status":200,"body":{"total":208,"users":[{"id":1,"name":"Terry"}]}}"#,
            h: r#"{"Content-Type":"application/json","X-Request-Id":"abc123"}"#,
            expect_duplicate: true,
            note: "Identical → blocked",
        },
        // ── Run 3: Same data, different JSON key ORDER → still DUPLICATE ──
        Scenario {
            name: "Run 3 — Same data, keys in different order",
            q: r#"{"url":"https://dummyjson.com/users","body":{},"method":"GET"}"#,
            p: r#"{"body":{"users":[{"name":"Terry","id":1}],"total":208},"status":200}"#,
            h: r#"{"X-Request-Id":"abc123","Content-Type":"application/json"}"#,
            expect_duplicate: true,
            note: "Key order swapped — normalization catches this, blocked",
        },
        // ── Run 4: ONE character different in response → NEW entry ────────
        Scenario {
            name: "Run 4 — Response body has 1 char difference",
            q: r#"{"method":"GET","url":"https://dummyjson.com/users","body":{}}"#,
            p: r#"{"status":200,"body":{"total":209,"users":[{"id":1,"name":"Terry"}]}}"#,
            h: r#"{"Content-Type":"application/json","X-Request-Id":"abc123"}"#,
            expect_duplicate: false,
            note: "total:208 → total:209 — one digit changed, this is a new E",
        },
        // ── Run 5: Different URL → NEW entry ─────────────────────────────
        Scenario {
            name: "Run 5 — Different URL (POST /users/1)",
            q: r#"{"method":"GET","url":"https://dummyjson.com/users/1","body":{}}"#,
            p: r#"{"status":200,"body":{"id":1,"name":"Terry","age":27}}"#,
            h: r#"{"Content-Type":"application/json"}"#,
            expect_duplicate: false,
            note: "Different endpoint — new entry",
        },
        // ── Run 6: Repeat of Run 5 → DUPLICATE ───────────────────────────
        Scenario {
            name: "Run 6 — Repeat of Run 5",
            q: r#"{"method":"GET","url":"https://dummyjson.com/users/1","body":{}}"#,
            p: r#"{"status":200,"body":{"id":1,"name":"Terry","age":27}}"#,
            h: r#"{"Content-Type":"application/json"}"#,
            expect_duplicate: true,
            note: "Same as Run 5 → blocked",
        },
        // ── Run 7: Q different, P+H same → NEW entry ─────────────────────
        Scenario {
            name: "Run 7 — Q changed (different method), P+H same",
            q: r#"{"method":"POST","url":"https://dummyjson.com/users/1","body":{"name":"Bob"}}"#,
            p: r#"{"status":200,"body":{"id":1,"name":"Terry","age":27}}"#,
            h: r#"{"Content-Type":"application/json"}"#,
            expect_duplicate: false,
            note: "Q differs → completely different E",
        },
        // ── Run 8: H different only → NEW entry ──────────────────────────
        Scenario {
            name: "Run 8 — Only H is different (extra header)",
            q: r#"{"method":"GET","url":"https://dummyjson.com/users","body":{}}"#,
            p: r#"{"status":200,"body":{"total":208,"users":[{"id":1,"name":"Terry"}]}}"#,
            h: r#"{"Content-Type":"application/json","X-Request-Id":"abc123","Authorization":"Bearer xyz"}"#,
            expect_duplicate: false,
            note: "Added Authorization header → H changed → new E",
        },
    ]
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — runs both approaches and compares
// ─────────────────────────────────────────────────────────────────────────────

fn main() {
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║   EDMS — Duplicate E(Q,P,H) Detection Algorithm Demo        ║");
    println!("╚══════════════════════════════════════════════════════════════╝\n");

    let scenarios = mock_scenarios();

    // ── Approach 1: Naive (broken) ───────────────────────────────────────────
    println!("═══ APPROACH 1: Naive raw string (BROKEN) ══════════════════════\n");
    {
        let mut seen: HashSet<String> = HashSet::new();
        for s in &scenarios {
            let key = approach1_naive_key(s.q, s.p, s.h);
            let is_dup = seen.contains(&key);
            if !is_dup {
                seen.insert(key);
            }
            let correct = is_dup == s.expect_duplicate;
            let mark = if correct { "✓" } else { "✗ WRONG" };
            println!("  [{mark}] {} → {}", s.name, if is_dup { "DUPLICATE" } else { "NEW" });
            if !correct {
                println!("       Expected: {}  Note: {}", if s.expect_duplicate { "DUPLICATE" } else { "NEW" }, s.note);
            }
        }
        println!("\n  Problem: Run 3 (key order swapped) is INCORRECTLY treated as NEW.");
        println!("  Raw string comparison can't handle JSON key ordering.\n");
    }

    // ── Approach 2: Normalize + SHA-256 + HashSet (recommended) ─────────────
    println!("═══ APPROACH 2: Normalize → SHA-256 → HashSet (RECOMMENDED) ════\n");
    {
        let mut seen: HashSet<String> = HashSet::new();
        let mut all_correct = true;
        for s in &scenarios {
            let is_dup = check_duplicate(&mut seen, s.q, s.p, s.h);
            let correct = is_dup == s.expect_duplicate;
            if !correct {
                all_correct = false;
            }
            let mark = if correct { "✓" } else { "✗ WRONG" };
            let result = if is_dup { "DUPLICATE — blocked" } else { "NEW — allowed" };
            println!("  [{mark}] {}", s.name);
            println!("       Result: {}   Note: {}", result, s.note);
        }
        println!("\n  HashSet size: {} entries ({} bytes RAM)\n", seen.len(), seen.len() * 64);
        if all_correct {
            println!("  ✅ ALL {} scenarios correct!\n", scenarios.len());
        } else {
            println!("  ❌ Some scenarios incorrect.\n");
        }
    }

    // ── Canonical form demo ──────────────────────────────────────────────────
    println!("═══ CANONICAL FORM DEMO ════════════════════════════════════════\n");
    {
        let raw_a = r#"{"b":2,"a":1,"nested":{"z":9,"m":5}}"#;
        let raw_b = r#"{"a":1,"nested":{"m":5,"z":9},"b":2}"#;
        let canon_a = canonical(raw_a).unwrap();
        let canon_b = canonical(raw_b).unwrap();
        println!("  raw_a   : {raw_a}");
        println!("  canon_a : {canon_a}");
        println!("  raw_b   : {raw_b}");
        println!("  canon_b : {canon_b}");
        println!("  Equal?  : {}", canon_a == canon_b);
    }

    // ── SHA-256 demo ─────────────────────────────────────────────────────────
    println!("\n═══ SHA-256 HASH SIZE DEMO ═════════════════════════════════════\n");
    {
        let tiny = make_hash_key(r#"{"a":1}"#, r#"{"b":2}"#, r#"{}"#).unwrap();
        let huge_body = r#"{"status":200,"body":{"users":[{"id":1,"name":"Terry","email":"t@e.com","address":{"city":"Phoenix","zip":"85001"}},{"id":2,"name":"Bob","email":"b@e.com","address":{"city":"Dallas","zip":"75001"}}],"total":208}}"#;
        let huge = make_hash_key(r#"{"method":"GET","url":"https://api.example.com/users"}"#, huge_body, r#"{"Content-Type":"application/json"}"#).unwrap();
        println!("  Tiny input  hash ({} bytes input  → {} char hash): {}", 30, tiny.len(), &tiny[..20]);
        println!("  Large input hash ({} bytes input → {} char hash): {}", huge_body.len(), huge.len(), &huge[..20]);
        println!("  SHA-256 always produces exactly 64 hex chars = 32 bytes. Fixed size.");
    }

    // ── Bloom Filter comparison ──────────────────────────────────────────────
    println!("\n═══ BLOOM FILTER vs HASHSET COMPARISON ════════════════════════\n");
    println!("  HashSet (chosen):                Bloom Filter (rejected):");
    println!("  ─────────────────────────────    ──────────────────────────────");
    println!("  Exact — no false positives  ✅    False positive rate ~0.01%   ❌");
    println!("  O(1) lookup                 ✅    O(k) lookup (k=hash funcs)   ✅");
    println!("  64 bytes × N entries        ✅    ~1.2 bytes × N entries       ✅");
    println!("  10k entries = 640 KB        ✅    10k entries = 12 KB          ✅");
    println!("  No data loss possible       ✅    ~1 real QP blocked per 10k   ❌");
    println!();
    println!("  VERDICT: HashSet wins.");
    println!("  QPs rarely exceed 1000 total across all endpoints.");
    println!("  640 KB is negligible. False positives = real data loss. Unacceptable.");

    println!("\n═══════════════════════════════════════════════════════════════\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT TESTS  —  cargo test
// ─────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> HashSet<String> {
        HashSet::new()
    }

    // ── normalize ────────────────────────────────────────────────────────────

    #[test]
    fn normalize_sorts_object_keys() {
        assert_eq!(
            canonical(r#"{"b":2,"a":1}"#).unwrap(),
            canonical(r#"{"a":1,"b":2}"#).unwrap()
        );
    }

    #[test]
    fn normalize_sorts_nested_keys() {
        let a = canonical(r#"{"z":{"y":1,"x":2},"a":3}"#).unwrap();
        let b = canonical(r#"{"a":3,"z":{"x":2,"y":1}}"#).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn normalize_preserves_array_order() {
        // Arrays are order-sensitive: [1,2,3] ≠ [3,2,1]
        assert_ne!(
            canonical(r#"[1,2,3]"#).unwrap(),
            canonical(r#"[3,2,1]"#).unwrap()
        );
    }

    // ── duplicate detection ──────────────────────────────────────────────────

    #[test]
    fn exact_duplicate_blocked() {
        let mut seen = fresh();
        let q = r#"{"method":"GET","url":"https://api.example.com/users"}"#;
        let p = r#"{"status":200,"body":{"total":1}}"#;
        let h = r#"{"Content-Type":"application/json"}"#;
        assert!(!check_duplicate(&mut seen, q, p, h)); // first → new
        assert!(check_duplicate(&mut seen, q, p, h));  // second → dup
    }

    #[test]
    fn different_key_order_is_still_duplicate() {
        let mut seen = fresh();
        let q1 = r#"{"method":"GET","url":"https://api.example.com/users"}"#;
        let q2 = r#"{"url":"https://api.example.com/users","method":"GET"}"#; // swapped
        let p = r#"{"status":200}"#;
        let h = r#"{}"#;
        assert!(!check_duplicate(&mut seen, q1, p, h));
        assert!(check_duplicate(&mut seen, q2, p, h)); // same data, diff order → dup
    }

    #[test]
    fn one_char_different_is_new() {
        let mut seen = fresh();
        let q = r#"{"method":"GET","url":"https://api.example.com/users"}"#;
        let p1 = r#"{"status":200}"#;
        let p2 = r#"{"status":201}"#; // one char different
        let h = r#"{}"#;
        assert!(!check_duplicate(&mut seen, q, p1, h));
        assert!(!check_duplicate(&mut seen, q, p2, h)); // different → new
    }

    #[test]
    fn only_h_different_is_new() {
        let mut seen = fresh();
        let q = r#"{"method":"GET","url":"https://api.example.com/users"}"#;
        let p = r#"{"status":200}"#;
        let h1 = r#"{"Content-Type":"application/json"}"#;
        let h2 = r#"{"Content-Type":"application/json","Authorization":"Bearer xyz"}"#;
        assert!(!check_duplicate(&mut seen, q, p, h1));
        assert!(!check_duplicate(&mut seen, q, p, h2)); // H changed → new E
    }

    #[test]
    fn hash_is_always_64_chars() {
        let key = make_hash_key(r#"{"a":1}"#, r#"{"b":2}"#, r#"{}"#).unwrap();
        assert_eq!(key.len(), 64);
    }

    #[test]
    fn separator_prevents_concatenation_collision() {
        // Without separator "ab"+"cd" could match "a"+"bcd"
        let k1 = make_hash_key(r#""ab""#, r#""cd""#, r#""ef""#).unwrap();
        let k2 = make_hash_key(r#""a""#, r#""bcd""#, r#""ef""#).unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn all_mock_scenarios_correct() {
        let mut seen = fresh();
        for s in super::mock_scenarios() {
            let is_dup = check_duplicate(&mut seen, s.q, s.p, s.h);
            assert_eq!(
                is_dup, s.expect_duplicate,
                "Scenario '{}' failed: expected {}, got {}. Note: {}",
                s.name,
                if s.expect_duplicate { "DUPLICATE" } else { "NEW" },
                if is_dup { "DUPLICATE" } else { "NEW" },
                s.note
            );
        }
    }
}
