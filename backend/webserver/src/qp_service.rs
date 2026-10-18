use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

/// Recursively sorts all JSON object keys alphabetically.
pub fn normalize(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
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
        Value::Array(arr) => Value::Array(arr.iter().map(normalize).collect()),
        other => other.clone(),
    }
}

/// Parses and canonicalizes a JSON string into a compact, normalized representation.
pub fn canonical(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    match serde_json::from_str::<Value>(trimmed) {
        Ok(v) => serde_json::to_string(&normalize(&v)).unwrap_or_else(|_| trimmed.to_string()),
        Err(_) => trimmed.to_string(),
    }
}

/// Builds a canonical string key for one (Q, P, H) snapshot.
pub fn make_canonical_key(q: &str, p: &str, h: &str) -> String {
    let cq = canonical(q);
    let cp = canonical(p);
    let ch = canonical(h);
    format!("{}\x00{}\x00{}", cq, cp, ch)
}

/// Reads the Q, P, H file contents for a specific QP number from disk.
pub fn read_qp_triple(folder: &Path, eid: &str, num: i32) -> Option<(String, String, String)> {
    let req_path = folder.join(format!("{eid}-request-{num}.json"));
    let res_path = folder.join(format!("{eid}-response-{num}.json"));
    let hdr_path = folder.join(format!("{eid}-headers-{num}.json"));

    let q = fs::read_to_string(&req_path).ok()?;
    let p = fs::read_to_string(&res_path).ok()?;
    let h = fs::read_to_string(&hdr_path).unwrap_or_else(|_| "{}".to_string());

    Some((q, p, h))
}

/// Scans the endpoint storage directory and returns all existing QP request numbers.
pub fn list_existing_qp_numbers(folder: &Path, eid: &str) -> Vec<i32> {
    let mut numbers = Vec::new();
    let prefix = format!("{eid}-request-");
    let suffix = ".json";

    if let Ok(entries) = fs::read_dir(folder) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if name_str.starts_with(&prefix) && name_str.ends_with(suffix) {
                let num_str = &name_str[prefix.len()..name_str.len() - suffix.len()];
                if let Ok(n) = num_str.parse::<i32>() {
                    numbers.push(n);
                }
            }
        }
    }
    numbers.sort_unstable();
    numbers
}

/// Returns the existing QP number if an identical snapshot exists, or None.
pub fn find_duplicate_qp(
    folder: &Path,
    eid: &str,
    new_q: &str,
    new_p: &str,
    new_h: &str,
    exclude_request_number: Option<i32>,
) -> Option<i32> {
    if !folder.exists() {
        return None;
    }

    let candidate_key = make_canonical_key(new_q, new_p, new_h);
    let existing_numbers = list_existing_qp_numbers(folder, eid);

    for num in existing_numbers {
        if Some(num) == exclude_request_number {
            continue;
        }

        if let Some((q, p, h)) = read_qp_triple(folder, eid, num) {
            let existing_key = make_canonical_key(&q, &p, &h);
            if candidate_key == existing_key {
                return Some(num);
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "edms_qp_test_{}_{}",
            name,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn test_canonical_key_same_despite_key_order() {
        let q1 = r#"{"url":"https://api.test/users","method":"GET","body":{"b":2,"a":1}}"#;
        let q2 = r#"{"method":"GET","body":{"a":1,"b":2},"url":"https://api.test/users"}"#;
        let p = r#"{"status":200,"body":{"total":10}}"#;
        let h = r#"{"content-type":"application/json"}"#;

        let key1 = make_canonical_key(q1, p, h);
        let key2 = make_canonical_key(q2, p, h);

        assert_eq!(key1, key2);
    }

    #[test]
    fn test_canonical_key_differs_on_single_character() {
        let q = r#"{"method":"GET","url":"/users"}"#;
        let p1 = r#"{"status":200,"body":{"total":10}}"#;
        let p2 = r#"{"status":200,"body":{"total":11}}"#;
        let h = r#"{}"#;

        let key1 = make_canonical_key(q, p1, h);
        let key2 = make_canonical_key(q, p2, h);

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_find_duplicate_in_directory() {
        let dir = make_test_dir("find_dup");
        let eid = "E0001";

        let q1 = r#"{"method":"GET","url":"/items"}"#;
        let p1 = r#"{"status":200,"items":["a","b"]}"#;
        let h1 = r#"{"auth":"bearer token"}"#;

        fs::write(&dir.join(format!("{eid}-request-1.json")), q1).unwrap();
        fs::write(&dir.join(format!("{eid}-response-1.json")), p1).unwrap();
        fs::write(&dir.join(format!("{eid}-headers-1.json")), h1).unwrap();

        let dup = find_duplicate_qp(&dir, eid, q1, p1, h1, None);
        assert_eq!(dup, Some(1));

        let q1_permuted = r#"{"url":"/items","method":"GET"}"#;
        let dup_permuted = find_duplicate_qp(&dir, eid, q1_permuted, p1, h1, None);
        assert_eq!(dup_permuted, Some(1));

        let q_new = r#"{"method":"POST","url":"/items"}"#;
        let no_dup = find_duplicate_qp(&dir, eid, q_new, p1, h1, None);
        assert_eq!(no_dup, None);

        let excluded = find_duplicate_qp(&dir, eid, q1, p1, h1, Some(1));
        assert_eq!(excluded, None);
    }
}
