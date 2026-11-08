/** Định dạng chứng từ chi trả hoa hồng CTV. */
export const PROOF_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
/** Key chứng từ chi trả CTV — `/api/files` chỉ trả cho người có `affiliates:manage`. */
export const PAYOUT_PROOF_PREFIX = "proofs/payout-";
