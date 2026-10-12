// ── How to run the compute crate in Docker ───────────────────────────────────
// From the repo root:
//   docker build -t edms-compute -f backend/compute/Dockerfile .
//   docker run --rm edms-compute
//
// Or run locally (no Docker):
//   cd backend/compute
//   cargo run --bin child
//
// To run only the tests in this file:
//   cargo test reassign_tests
// ─────────────────────────────────────────────────────────────────────────────

use std::fs;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

pub fn write_endpoint_file<P: AsRef<Path>>(
    repo_path: P,
    eid: &str,
    page_index: usize,
    content: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let filename = format!("{}-{:03}.md", eid, page_index);
    let file = File::create(repo_path.as_ref().join(filename))?;
    let mut writer = BufWriter::new(file);
    writer.write_all(content.as_bytes())?;
    writer.flush()?;
    Ok(())
}

pub fn write_request_file<P: AsRef<Path>>(
    repo_path: P,
    eid: &str,
    req_index: usize,
    content: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(repo_path.as_ref())?;
    // Matches the {eid}-request-{N}.json convention from Ravi's file layout
    // email (2026-08-25) — also what request_metadata.file_path expects
    // (see run_test_impl/handle_run_test in the webserver crate).
    let filename = format!("{}-request-{}.json", eid, req_index);
    let file = File::create(repo_path.as_ref().join(filename))?;
    let mut writer = BufWriter::new(file);
    writer.write_all(content.as_bytes())?;
    writer.flush()?;
    Ok(())
}

pub fn write_response_file<P: AsRef<Path>>(
    repo_path: P,
    eid: &str,
    res_index: usize,
    content: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(repo_path.as_ref())?;
    let filename = format!("{}-response-{}.json", eid, res_index);
    let file = File::create(repo_path.as_ref().join(filename))?;
    let mut writer = BufWriter::new(file);
    writer.write_all(content.as_bytes())?;
    writer.flush()?;
    Ok(())
}

/// Per Ravi (2026-09-04): "write logic to capture headers, apply correct
/// file name and write to the correct EID folder" — the third file per QP
/// alongside request/response. `content` is expected to already be the
/// combined {"request_headers":..., "response_headers":...} JSON string —
/// this function just writes it, same shape as the other two.
pub fn write_headers_file<P: AsRef<Path>>(
    repo_path: P,
    eid: &str,
    index: usize,
    content: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(repo_path.as_ref())?;
    let filename = format!("{}-headers-{}.json", eid, index);
    let file = File::create(repo_path.as_ref().join(filename))?;
    let mut writer = BufWriter::new(file);
    writer.write_all(content.as_bytes())?;
    writer.flush()?;
    Ok(())
}

// =============================================================================
// QP REASSIGNMENT AFTER DELETION  (PID task — QPs out of order fix)
//
// Problem: When a user deletes QPs (e.g. deletes QP 3 and 4), the remaining
// files on disk have gaps in their numbers:
//
//     E0001-request-1.json
//     E0001-request-2.json
//     E0001-request-5.json   ← gap: 3 and 4 are missing
//
// This function fixes the gaps by renaming files to sequential numbers:
//
//     E0001-request-1.json   ← unchanged
//     E0001-request-2.json   ← unchanged
//     E0001-request-3.json   ← renamed from 5
//
// Design decisions (from task spec):
//   - SQLite stores count only, not sequence → NO SQLite changes needed
//   - Frontend re-enumerates automatically on reopen → NO frontend changes
//   - File names are trivially modified (just fs::rename), all at once
//   - Q, P, H each have their own integer — we rename each file type separately
//   - Applied to both globalEQPData/ and history/ folders (call twice)
// =============================================================================

/// Reassigns QP file numbers after deletion so they are always sequential.
///
/// # Arguments
/// * `folder` - folder containing the QP files e.g. `storage/globalEQPData/E0001/`
/// * `eid`    - the endpoint ID string e.g. `"E0001"`
///
/// # What it does
/// 1. Scans folder for all files matching `{eid}-request-{N}.json`
/// 2. Collects existing QP numbers and sorts them
/// 3. Renames request + response + headers files together so numbers are 1,2,3,...
///
/// # Returns
/// `Ok(count)` where count = number of QP sets that were renamed (0 = no gaps found)
///
/// # Example
/// Before: 1, 2, 5  →  After: 1, 2, 3
pub fn reassign_qp_files<P: AsRef<Path>>(
    folder: P,
    eid: &str,
) -> Result<usize, Box<dyn std::error::Error>> {
    let folder = folder.as_ref();

    // Step 1: Collect all existing QP numbers by scanning for request files.
    // We use request files as the "source of truth" for which QP numbers exist.
    let mut existing_numbers: Vec<usize> = Vec::new();

    for entry in fs::read_dir(folder)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        // Match pattern: "{eid}-request-{N}.json"
        let prefix = format!("{}-request-", eid);
        let suffix = ".json";

        if name.starts_with(prefix.as_str()) && name.ends_with(suffix) {
            // Extract the number N from the filename
            let middle = &name[prefix.len()..name.len() - suffix.len()];
            if let Ok(n) = middle.parse::<usize>() {
                existing_numbers.push(n);
            }
        }
    }

    // Step 2: Sort numbers ascending so we rename in order (avoids collisions
    // where e.g. renaming 2→3 would overwrite the existing 3 before it moves)
    existing_numbers.sort_unstable();

    // Step 3: Rename each file triple (Q=request, P=response, H=headers)
    // to the new sequential index
    let mut renamed_count = 0;

    for (new_index_zero_based, &old_number) in existing_numbers.iter().enumerate() {
        let new_number = new_index_zero_based + 1; // 1-based

        // If number did not change, skip (no rename needed)
        if old_number == new_number {
            continue;
        }

        // Rename Q, P, H files for this QP number
        for file_type in ["request", "response", "headers"] {
            let old_name = format!("{}-{}-{}.json", eid, file_type, old_number);
            let new_name = format!("{}-{}-{}.json", eid, file_type, new_number);

            let old_path: PathBuf = folder.join(&old_name);
            let new_path: PathBuf = folder.join(&new_name);

            if old_path.exists() {
                fs::rename(&old_path, &new_path)?;
                println!("[QP REASSIGN] {} -> {}", old_name, new_name);
            }
            // If the file doesn't exist (e.g. headers never written), skip silently
        }

        renamed_count += 1;
    }

    println!(
        "[QP REASSIGN] Done for {}. {} QP set(s) renumbered.",
        eid, renamed_count
    );

    Ok(renamed_count)
}

// =============================================================================
// TESTS for reassign_qp_files
// Run with:  cargo test reassign_tests
// =============================================================================
#[cfg(test)]
mod reassign_tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    // Helper: create all three fake QP files for a given number N
    fn create_qp_files(folder: &Path, eid: &str, n: usize) {
        for ftype in ["request", "response", "headers"] {
            let path = folder.join(format!("{}-{}-{}.json", eid, ftype, n));
            fs::write(path, format!("{{\"qp\":{}}}", n)).unwrap();
        }
    }

    // Helper: check if QP number N exists (using request file as proxy)
    fn qp_exists(folder: &Path, eid: &str, n: usize) -> bool {
        folder
            .join(format!("{}-request-{}.json", eid, n))
            .exists()
    }

    #[test]
    fn test_no_gaps_nothing_renamed() {
        // QPs 1,2,3 already sequential — renamed_count must be 0
        let dir = tempdir().unwrap();
        let eid = "E0001";
        create_qp_files(dir.path(), eid, 1);
        create_qp_files(dir.path(), eid, 2);
        create_qp_files(dir.path(), eid, 3);

        let renamed = reassign_qp_files(dir.path(), eid).unwrap();
        assert_eq!(renamed, 0);
        assert!(qp_exists(dir.path(), eid, 1));
        assert!(qp_exists(dir.path(), eid, 2));
        assert!(qp_exists(dir.path(), eid, 3));
    }

    #[test]
    fn test_gap_at_end_fixed() {
        // QPs 1, 2, 5  →  must become 1, 2, 3
        let dir = tempdir().unwrap();
        let eid = "E0001";
        create_qp_files(dir.path(), eid, 1);
        create_qp_files(dir.path(), eid, 2);
        create_qp_files(dir.path(), eid, 5);

        let renamed = reassign_qp_files(dir.path(), eid).unwrap();
        assert_eq!(renamed, 1); // only QP 5 was renamed to 3

        assert!(qp_exists(dir.path(), eid, 1));
        assert!(qp_exists(dir.path(), eid, 2));
        assert!(qp_exists(dir.path(), eid, 3)); // old 5 is now 3
        assert!(!qp_exists(dir.path(), eid, 5)); // 5 no longer exists
    }

    #[test]
    fn test_gap_in_middle_fixed() {
        // QPs 1, 4, 7  →  must become 1, 2, 3
        let dir = tempdir().unwrap();
        let eid = "E0042";
        create_qp_files(dir.path(), eid, 1);
        create_qp_files(dir.path(), eid, 4);
        create_qp_files(dir.path(), eid, 7);

        let renamed = reassign_qp_files(dir.path(), eid).unwrap();
        assert_eq!(renamed, 2); // 4→2 and 7→3

        assert!(qp_exists(dir.path(), eid, 1));
        assert!(qp_exists(dir.path(), eid, 2));
        assert!(qp_exists(dir.path(), eid, 3));
        assert!(!qp_exists(dir.path(), eid, 4));
        assert!(!qp_exists(dir.path(), eid, 7));
    }

    #[test]
    fn test_single_qp_no_rename() {
        let dir = tempdir().unwrap();
        create_qp_files(dir.path(), "E0001", 1);
        let renamed = reassign_qp_files(dir.path(), "E0001").unwrap();
        assert_eq!(renamed, 0);
    }

    #[test]
    fn test_empty_folder_no_error() {
        let dir = tempdir().unwrap();
        let renamed = reassign_qp_files(dir.path(), "E0001").unwrap();
        assert_eq!(renamed, 0);
    }
}
