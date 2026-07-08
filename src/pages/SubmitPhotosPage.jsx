/**
 * Submit Photos Page
 * Uploads room photos to Cloudinary and records metadata in Firestore.
 * No authentication required — intentionally open to any visitor.
 */
import React, { useMemo, useRef, useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import {
  BUILDINGS,
  CAMPUS_GROUPS,
  LARGE_STYLE_AREAS,
  getBuildingsForGroup,
  getLayoutsForAddress,
} from "../../js/housing-data.js";
import { LARGE_STYLE_RESIDENCES_GROUP } from "../lib/listing-helpers";

const PHOTO_TYPES = ["Room", "Bathroom", "Kitchen", "Common Space", "Other"];

const FENWAY_CAMPUS_GROUP = "Fenway Campus";
const STUDENT_VILLAGE_GROUP = "Student Village";

const CAMPUS_GROUP_BLOCKS = [
  {
    title: "Apartments",
    groups: [
      "South Campus Apartments",
      "East Campus Apartments",
      "Central Campus Apartments",
      "Student Village",
    ],
  },
  {
    title: "Large Traditional-Style Residences",
    groups: ["Large Traditional-Style Residences"],
  },
  {
    title: "Fenway Campus",
    groups: ["Fenway Campus"],
  },
  {
    title: "Brownstones",
    groups: [
      "Central Campus Traditional Brownstones",
      "East Campus Traditional Brownstones",
      "South Campus Traditional Brownstones",
    ],
  },
];

const LAYOUT_TYPE_ORDER = {
  Apartment: 1,
  Studio: 2,
  Traditional: 3,
  Suite: 4,
  "Semi Suite": 5,
};
const OCCUPANCY_ORDER = { Single: 1, Double: 2, Triple: 3, Quad: 4 };
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function splitLayout(layout) {
  const parts = String(layout || "").trim().split(" ");
  if (parts.length < 2) return { layoutType: layout, occupancy: "" };
  return {
    occupancy: parts[parts.length - 1],
    layoutType: parts.slice(0, -1).join(" "),
  };
}

function orderLayouts(layouts) {
  return [...layouts].sort((a, b) => {
    const splitA = splitLayout(a);
    const splitB = splitLayout(b);
    const typeA = splitA.layoutType.replace(/-/g, " ");
    const typeB = splitB.layoutType.replace(/-/g, " ");
    const typeRankA = LAYOUT_TYPE_ORDER[typeA] ?? Number.MAX_SAFE_INTEGER;
    const typeRankB = LAYOUT_TYPE_ORDER[typeB] ?? Number.MAX_SAFE_INTEGER;
    if (typeRankA !== typeRankB) return typeRankA - typeRankB;
    const occA = OCCUPANCY_ORDER[splitA.occupancy] ?? Number.MAX_SAFE_INTEGER;
    const occB = OCCUPANCY_ORDER[splitB.occupancy] ?? Number.MAX_SAFE_INTEGER;
    if (occA !== occB) return occA - occB;
    return collator.compare(a, b);
  });
}

const DEFAULT_FORM = {
  campusGroup: "",
  address: "",
  layout: "",
  photoTypes: [],
};

export default function SubmitPhotosPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const isLargeCurrent = form.campusGroup === LARGE_STYLE_RESIDENCES_GROUP;
  const isNamedBuilding = [LARGE_STYLE_RESIDENCES_GROUP, FENWAY_CAMPUS_GROUP, STUDENT_VILLAGE_GROUP].includes(form.campusGroup);

  // Buildings for the selected campus group — same as currentAddresses in SubmitPage.
  const currentAddresses = useMemo(() => {
    if (!form.campusGroup) return [];
    return getBuildingsForGroup(form.campusGroup);
  }, [form.campusGroup]);

  // Ordered layouts for the selected address — same as currentLayouts in SubmitPage.
  const currentLayouts = useMemo(() => {
    if (!form.address) return [];
    return orderLayouts(getLayoutsForAddress(form.address));
  }, [form.address]);

  function handleCurrentGroupChange(value) {
    setForm({ ...DEFAULT_FORM, campusGroup: value });
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handlePhotoTypeToggle(type, checked) {
    setForm((prev) => ({
      ...prev,
      photoTypes: checked
        ? prev.photoTypes.includes(type) ? prev.photoTypes : [...prev.photoTypes, type]
        : prev.photoTypes.filter((t) => t !== type),
    }));
  }

  function handleFileChange(event) {
    setFiles(Array.from(event.target.files));
  }

  function validate() {
    if (!form.campusGroup) return "Select a campus group.";
    if (!form.address) return "Select an address.";
    if (!form.layout) return "Select a room layout.";
    if (!form.photoTypes.length) return "Select at least one photo type.";
    if (!files.length) return "Select at least one photo to upload.";
    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setUploadProgress(0);

    try {
      const uploadedPhotos = [];
      const total = files.length;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "terrier_housing");

        let response;
        try {
          response = await fetch("https://api.cloudinary.com/v1_1/g8fbjp6s/image/upload", {
            method: "POST",
            body: formData,
          });
        } catch {
          throw new Error(`Failed to upload "${file.name}": network error.`);
        }

        if (!response.ok) {
          throw new Error(`Failed to upload "${file.name}": server returned ${response.status}.`);
        }

        const data = await response.json();
        if (!data.secure_url) {
          throw new Error(`Failed to upload "${file.name}": no URL in response.`);
        }

        uploadedPhotos.push({ url: data.secure_url, filename: file.name });
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }

      await addDoc(collection(db, "housingSubmissions"), {
        campusGroup: form.campusGroup,
        address: form.address,
        layout: form.layout,
        photoTypes: form.photoTypes,
        photos: uploadedPhotos,
        submittedAt: serverTimestamp(),
      });

      setSuccess(`${uploadedPhotos.length} photo${uploadedPhotos.length !== 1 ? "s" : ""} submitted successfully. Thank you!`);
      setForm(DEFAULT_FORM);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (submitError) {
      console.error(submitError);
      setError(submitError.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }

  return (
    <div id="panel-submit-photos" className="panel">
      {success ? <div className="msg msg-success" style={{ marginBottom: "1.5rem", maxWidth: 820 }}>{success}</div> : null}

      <div className="form-card">
        <div className="form-card-head">
          <div>
            <h2 className="form-title">Submit Room Photos</h2>
            <p className="form-sub">
              Help other BU students see what rooms look like. Photos are visible to everyone after review.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <section className="fsec">
            <h3 className="fsec-title">Room Details</h3>
            <div className="fgrid">
              <div className="ffield">
                <label>Campus Group <span className="req">*</span></label>
                <select value={form.campusGroup} onChange={(event) => handleCurrentGroupChange(event.target.value)}>
                  <option value="">Select campus group...</option>
                  {CAMPUS_GROUP_BLOCKS.map((block) => (
                    <optgroup key={block.title} label={block.title}>
                      {block.groups.filter((group) => CAMPUS_GROUPS.includes(group)).map((group) => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="ffield">
                <label>{isNamedBuilding ? "Building Name" : "Address"} <span className="req">*</span></label>
                <select
                  value={form.address}
                  disabled={!form.campusGroup}
                  onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value, layout: "" }))}
                >
                  <option value="">Select {isNamedBuilding ? "building" : "address"}...</option>
                  {isLargeCurrent ? (
                    LARGE_STYLE_AREAS.map((area) => {
                      const areaBuildings = currentAddresses
                        .filter((b) => b.area === area)
                        .sort((a, b) => collator.compare(a.name, b.name));
                      if (!areaBuildings.length) return null;
                      return (
                        <optgroup key={area} label={area}>
                          {areaBuildings.map((building) => (
                            <option key={building.address} value={building.address}>{building.name}</option>
                          ))}
                        </optgroup>
                      );
                    })
                  ) : (
                    currentAddresses
                      .sort((a, b) => collator.compare(isNamedBuilding ? a.name : a.address, isNamedBuilding ? b.name : b.address))
                      .map((building) => (
                        <option key={building.address} value={building.address}>
                          {isNamedBuilding
                            ? building.name
                            : building.name === building.address
                              ? building.address
                              : `${building.address} (${building.name})`}
                        </option>
                      ))
                  )}
                </select>
                {isNamedBuilding
                  ? <p className="fhint">Your building name will be visible on your submission.</p>
                  : <p className="fhint">Your address is only used to select the correct layout options.</p>
                }
              </div>

              <div className="ffield">
                <label>Room Layout <span className="req">*</span></label>
                <select
                  value={form.layout}
                  disabled={!form.address}
                  onChange={(event) => setForm((prev) => ({ ...prev, layout: event.target.value }))}
                >
                  <option value="">{form.address ? "Select layout..." : "Select address first..."}</option>
                  {currentLayouts.map((layout) => (
                    <option key={layout} value={layout}>{layout}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="fsec">
            <h3 className="fsec-title">Photo Details</h3>
            <div className="fgrid">
              <div className="ffield full">
                <label>Photo Type <span className="req">*</span></label>
                <div className="checkbox-group">
                  {PHOTO_TYPES.map((type) => (
                    <label key={type} className="checkbox-option">
                      <input
                        type="checkbox"
                        checked={form.photoTypes.includes(type)}
                        onChange={(e) => handlePhotoTypeToggle(type, e.target.checked)}
                      />
                      {type}
                    </label>
                  ))}
                </div>
              </div>

              <div className="ffield full">
                <label>Photos <span className="req">*</span></label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                />
                {files.length > 0 && (
                  <p className="fhint">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                )}
              </div>
            </div>
          </section>

          {error ? <div className="msg msg-error" style={{ marginBottom: "1rem" }}>{error}</div> : null}

          {busy && (
            <div className="msg" style={{ marginBottom: "1rem", background: "var(--bg-alt, #f8f8f8)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.75rem 1rem" }}>
              Uploading… {uploadProgress}%
              <div style={{ marginTop: 6, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${uploadProgress}%`,
                    background: "var(--red, #cc0000)",
                    borderRadius: 3,
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>
          )}

          <div className="fsec" style={{ borderTop: "none", paddingTop: 0, marginTop: "1.25rem" }}>
            <button type="submit" className="btn-red" disabled={busy}>
              {busy ? "Uploading…" : "Submit Photos"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
