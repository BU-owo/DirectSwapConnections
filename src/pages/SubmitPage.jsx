import React, { useEffect, useMemo, useState } from "react";
import {
  CAMPUS_GROUPS,
  getBuildingByAddress,
  getBuildingsForGroup,
  getLargeResidenceAreas,
  getLargeResidenceBuildings,
  getLayoutsForAddress,
  getLayoutsForGroups,
  getLayoutsForLargeResidenceSelections,
} from "../../js/housing-data.js";
import { useAppContext } from "../context/AppContext";
import {
  allowedWantedGenders,
  buildContactPayload,
  buildListingPayload,
  LARGE_STYLE_RESIDENCES_GROUP,
} from "../lib/listing-helpers";

const LAYOUT_COLUMNS = ["Apartment", "Studio", "Traditional", "Suite", "Semi Suite"];
const OCCUPANCY_ORDER = { Single: 1, Double: 2, Triple: 3, Quad: 4 };
const LAYOUT_TYPE_ORDER = {
  Apartment: 1,
  Studio: 2,
  Traditional: 3,
  Suite: 4,
  "Semi Suite": 5,
};

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

const DEFAULT_FORM = {
  housingGender: "",
  currentCampusGroup: "",
  currentLargeResidenceArea: "",
  currentAddress: "",
  layout: "",
  bringingRoommate: "",
  laundryInBuilding: "",
  totalPeople: "",
  pitch: "",
  otherDetails: "",
  wantedGenders: [],
  wantedCampusGroups: [],
  wantedLargeResidenceAreas: [],
  wantedLargeResidenceBuildings: [],
  wantedLayoutStyles: [],
  redditUsername: "",
  phone: "",
  otherContact: "",
  agreedToTerms: false,
};

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

function toggleFromArray(arr, value, checked) {
  if (checked) return arr.includes(value) ? arr : [...arr, value];
  return arr.filter((item) => item !== value);
}

export default function SubmitPage() {
  const {
    user,
    myListing,
    contactsMap,
    signInWithGoogle,
    saveListing,
    deleteMyListing,
  } = useAppContext();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setForm(DEFAULT_FORM);
      setError("");
      setSuccess("");
      return;
    }

    if (!myListing) {
      setForm((prev) => ({
        ...DEFAULT_FORM,
        redditUsername: prev.redditUsername,
        phone: prev.phone,
        otherContact: prev.otherContact,
      }));
      return;
    }

    const contact = contactsMap[user.uid] || {};
    setForm({
      housingGender: myListing.housingGender || "",
      currentCampusGroup: myListing.currentCampusGroup || "",
      currentLargeResidenceArea: myListing.currentLargeResidenceArea || "",
      currentAddress: myListing.currentAddress || "",
      layout: myListing.layout || "",
      bringingRoommate: String(Boolean(myListing.bringingRoommate)),
      laundryInBuilding: String(Boolean(myListing.laundryInBuilding)),
      totalPeople: myListing.totalPeople ? String(myListing.totalPeople) : "",
      pitch: myListing.pitch || "",
      otherDetails: myListing.otherDetails || "",
      wantedGenders: myListing.wantedGenders || [],
      wantedCampusGroups: myListing.wantedCampusGroups || [],
      wantedLargeResidenceAreas: myListing.wantedLargeResidenceAreas || [],
      wantedLargeResidenceBuildings: myListing.wantedLargeResidenceBuildings || [],
      wantedLayoutStyles: myListing.wantedLayoutStyles || [],
      redditUsername: contact.redditUsername || "",
      phone: contact.phone || "",
      otherContact: contact.otherContact || "",
      agreedToTerms: true,
    });
  }, [contactsMap, myListing, user]);

  const isLargeCurrent = form.currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP;

  const currentAddresses = useMemo(() => {
    if (!form.currentCampusGroup) return [];
    const addresses = getBuildingsForGroup(form.currentCampusGroup);
    if (!isLargeCurrent) return addresses;
    if (!form.currentLargeResidenceArea) return [];
    return addresses.filter((building) => building.area === form.currentLargeResidenceArea);
  }, [form.currentCampusGroup, form.currentLargeResidenceArea, isLargeCurrent]);

  const currentLayouts = useMemo(() => {
    if (!form.currentAddress) return [];
    return orderLayouts(getLayoutsForAddress(form.currentAddress));
  }, [form.currentAddress]);

  const wantedLargeSelected = form.wantedCampusGroups.includes(LARGE_STYLE_RESIDENCES_GROUP);

  const wantedLargeBuildings = useMemo(() => {
    if (!wantedLargeSelected) return [];
    return getLargeResidenceBuildings(form.wantedLargeResidenceAreas).sort((a, b) => collator.compare(a.name, b.name));
  }, [form.wantedCampusGroups, form.wantedLargeResidenceAreas, wantedLargeSelected]);

  const availableWantedLayouts = useMemo(() => {
    const nonLargeGroups = form.wantedCampusGroups.filter((group) => group !== LARGE_STYLE_RESIDENCES_GROUP);
    const fromGroups = nonLargeGroups.length ? getLayoutsForGroups(nonLargeGroups) : [];
    const fromLarge = wantedLargeSelected
      ? getLayoutsForLargeResidenceSelections(
          form.wantedLargeResidenceAreas,
          form.wantedLargeResidenceBuildings
        )
      : [];

    return orderLayouts([...new Set([...fromGroups, ...fromLarge])]);
  }, [
    form.wantedCampusGroups,
    form.wantedLargeResidenceAreas,
    form.wantedLargeResidenceBuildings,
    wantedLargeSelected,
  ]);

  useEffect(() => {
    if (!wantedLargeSelected) {
      setForm((prev) => ({
        ...prev,
        wantedLargeResidenceAreas: [],
        wantedLargeResidenceBuildings: [],
      }));
      return;
    }

    setForm((prev) => {
      const validAreas = getLargeResidenceAreas();
      const nextAreas = prev.wantedLargeResidenceAreas.filter((area) => validAreas.includes(area));
      const validBuildings = getLargeResidenceBuildings(nextAreas).map((building) => building.name);
      const nextBuildings = prev.wantedLargeResidenceBuildings.filter((name) => validBuildings.includes(name));

      if (
        nextAreas.length === prev.wantedLargeResidenceAreas.length &&
        nextBuildings.length === prev.wantedLargeResidenceBuildings.length
      ) {
        return prev;
      }

      return {
        ...prev,
        wantedLargeResidenceAreas: nextAreas,
        wantedLargeResidenceBuildings: nextBuildings,
      };
    });
  }, [wantedLargeSelected]);

  useEffect(() => {
    setForm((prev) => {
      const allowed = new Set(availableWantedLayouts);
      const nextLayouts = prev.wantedLayoutStyles.filter((layout) => allowed.has(layout));
      if (nextLayouts.length === prev.wantedLayoutStyles.length) return prev;
      return { ...prev, wantedLayoutStyles: nextLayouts };
    });
  }, [availableWantedLayouts]);

  useEffect(() => {
    setForm((prev) => {
      const allowed = allowedWantedGenders(prev.housingGender);
      const nextWanted = prev.wantedGenders.filter((gender) => allowed.has(gender));
      if (nextWanted.length === prev.wantedGenders.length) return prev;
      return { ...prev, wantedGenders: nextWanted };
    });
  }, [form.housingGender]);

  const allowedGenders = allowedWantedGenders(form.housingGender);

  function handleCurrentGroupChange(value) {
    setForm((prev) => ({
      ...prev,
      currentCampusGroup: value,
      currentLargeResidenceArea: "",
      currentAddress: "",
      layout: "",
    }));
  }

  function handleAnyCampusToggle(checked) {
    setForm((prev) => ({
      ...prev,
      wantedCampusGroups: checked ? [...CAMPUS_GROUPS] : [],
    }));
  }

  function handleCampusGroupToggle(group, checked) {
    setForm((prev) => {
      const nextGroups = toggleFromArray(prev.wantedCampusGroups, group, checked);
      return { ...prev, wantedCampusGroups: nextGroups };
    });
  }

  function validateForm() {
    const totalPeople = Number(form.totalPeople);

    if (!form.housingGender) return "Select your housing assignment gender.";
    if (!form.currentCampusGroup) return "Select your campus group.";
    if (isLargeCurrent && !form.currentLargeResidenceArea) return "Select your Large Residence area.";
    if (!form.currentAddress) return "Select your current address.";
    if (!form.layout) return "Select your room layout.";
    if (!form.bringingRoommate) return "Indicate whether you are bringing a roommate.";
    if (!form.laundryInBuilding) return "Select whether laundry is in the building.";
    if (form.bringingRoommate === "true") {
      if (!Number.isInteger(totalPeople) || totalPeople < 2 || totalPeople > 10) {
        return "If bringing a roommate, total people must be a whole number from 2 to 10.";
      }
    }
    if (!form.pitch.trim()) return "Describe your room's best features.";
    if (!form.wantedGenders.length) return "Select at least one gender housing preference.";
    if (!form.wantedCampusGroups.length) return "Select at least one campus group you would consider.";
    if (wantedLargeSelected && !form.wantedLargeResidenceAreas.length) {
      return "Select at least one Large Residence area you would consider.";
    }
    if (wantedLargeSelected && !form.wantedLargeResidenceBuildings.length) {
      return "Select at least one Large Residence building you would consider.";
    }
    if (!form.wantedLayoutStyles.length) return "Select at least one layout style you would consider.";
    if (!form.redditUsername.trim() && !form.phone.trim() && !form.otherContact.trim()) {
      return "Add at least one contact method beyond your BU email.";
    }
    if (!form.agreedToTerms) return "You must agree to the terms and conditions.";

    const allowed = allowedWantedGenders(form.housingGender);
    if (form.wantedGenders.some((gender) => !allowed.has(gender))) {
      return form.housingGender === "Gender Neutral"
        ? "Invalid gender preference selection."
        : `If your housing assignment is ${form.housingGender}, choose only ${form.housingGender} or Gender Neutral.`;
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user) {
      setError("You must sign in first.");
      return;
    }

    const selectedBuilding = getBuildingByAddress(form.currentAddress);
    if (!selectedBuilding) {
      setError("Could not match address to BU housing data. Reselect campus group and address.");
      return;
    }

    if (isLargeCurrent && selectedBuilding.area !== form.currentLargeResidenceArea) {
      setError("Selected building does not match the chosen Large Residence area.");
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      const listingPayload = buildListingPayload(form, selectedBuilding);
      const contactPayload = buildContactPayload(form);
      await saveListing(listingPayload, contactPayload);
      setSuccess(myListing ? "Listing updated!" : "Listing submitted!");
    } catch (submitError) {
      console.error(submitError);
      setError(submitError.message || "Failed to save listing.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!user) return;
    const confirmed = window.confirm("Remove your listing? You will no longer appear in the database.");
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await deleteMyListing();
      setForm(DEFAULT_FORM);
      setSuccess("Your listing has been removed.");
    } catch (deleteError) {
      console.error(deleteError);
      setError(deleteError.message || "Failed to delete listing.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn() {
    setError("");
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(signInError.message || "Sign in failed.");
    }
  }

  const allCampusSelected =
    CAMPUS_GROUPS.length > 0 && form.wantedCampusGroups.length === CAMPUS_GROUPS.length;

  const groupedWantedLayouts = useMemo(() => {
    const base = LAYOUT_COLUMNS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});
    availableWantedLayouts.forEach((layout) => {
      const { layoutType } = splitLayout(layout);
      const normalizedType = layoutType.replace(/-/g, " ");
      const column = normalizedType === "Semi Suite" ? "Semi Suite" : normalizedType;
      if (base[column]) base[column].push(layout);
    });
    return base;
  }, [availableWantedLayouts]);

  if (!user) {
    return (
      <div id="panel-submit" className="panel">
        <div className="gate-wrap">
          <div className="gate-card">
            <div className="gate-icon">🏠</div>
            <h2 className="gate-title">Submit or Manage Your Listing</h2>
            <p className="gate-desc">Sign in with your BU Google account to post or edit your listing.</p>
            <button className="btn-google-lg" onClick={handleSignIn}>Sign in with Google</button>
            {error ? <div className="msg msg-error" style={{ marginTop: "1rem" }}>{error}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="panel-submit" className="panel">
      {success ? <div className="msg msg-success" style={{ marginBottom: "1.5rem", maxWidth: 820 }}>{success}</div> : null}

      <div className="form-card">
        <div className="form-card-head">
          <div>
            <h2 className="form-title">{myListing ? "Update Your Listing" : "Submit Your Swap Listing"}</h2>
            <p className="form-sub">
              {myListing
                ? "Your listing is live - edit or remove it below."
                : "Your listing is visible to everyone. Contact info is only shown to signed-in BU students."}
            </p>
          </div>
          <div className="user-pill">
            <img className="pill-avatar" src={user.photoURL || ""} alt="" />
            <span className="pill-email">{user.email}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <section className="fsec">
            <h3 className="fsec-title">Your Current Housing</h3>
            <div className="fgrid">
              <div className="ffield">
                <label>Housing Assignment Gender <span className="req">*</span></label>
                <select value={form.housingGender} onChange={(event) => setForm((prev) => ({ ...prev, housingGender: event.target.value }))}>
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Gender Neutral">Gender Neutral</option>
                </select>
              </div>

              <div className="ffield">
                <label>Campus Group <span className="req">*</span></label>
                <select value={form.currentCampusGroup} onChange={(event) => handleCurrentGroupChange(event.target.value)}>
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

              {isLargeCurrent ? (
                <div className="ffield">
                  <label>Large Residence Area <span className="req">*</span></label>
                  <select
                    value={form.currentLargeResidenceArea}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        currentLargeResidenceArea: event.target.value,
                        currentAddress: "",
                        layout: "",
                      }))
                    }
                  >
                    <option value="">Select area...</option>
                    {getLargeResidenceAreas().map((area) => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="ffield">
                <label>{isLargeCurrent ? "Current Building Name" : "Current Address"} <span className="req">*</span></label>
                <select
                  value={form.currentAddress}
                  disabled={!form.currentCampusGroup || (isLargeCurrent && !form.currentLargeResidenceArea)}
                  onChange={(event) => setForm((prev) => ({ ...prev, currentAddress: event.target.value, layout: "" }))}
                >
                  <option value="">{isLargeCurrent && !form.currentLargeResidenceArea ? "Select area first..." : "Select address..."}</option>
                  {currentAddresses.sort((a, b) => collator.compare(isLargeCurrent ? a.name : a.address, isLargeCurrent ? b.name : b.address)).map((building) => (
                    <option key={building.address} value={building.address}>
                      {isLargeCurrent
                        ? `${building.name}${building.address ? ` (${building.address})` : ""}`
                        : building.name === building.address
                          ? building.address
                          : `${building.address} (${building.name})`}
                    </option>
                  ))}
                </select>
                <p className="fhint">This will be kept private. It is only used to select the correct layout options.</p>
              </div>

              <div className="ffield">
                <label>Room Layout <span className="req">*</span></label>
                <select
                  value={form.layout}
                  disabled={!form.currentAddress}
                  onChange={(event) => setForm((prev) => ({ ...prev, layout: event.target.value }))}
                >
                  <option value="">{form.currentAddress ? "Select layout..." : "Select address first..."}</option>
                  {currentLayouts.map((layout) => (
                    <option key={layout} value={layout}>{layout}</option>
                  ))}
                </select>
              </div>

              <div className="ffield">
                <label>Bringing a Roommate? <span className="req">*</span></label>
                <div className="radio-row">
                  <label className="radio-opt">
                    <input type="radio" name="bringingRoommate" checked={form.bringingRoommate === "true"} onChange={() => setForm((prev) => ({ ...prev, bringingRoommate: "true" }))} /> Yes
                  </label>
                  <label className="radio-opt">
                    <input type="radio" name="bringingRoommate" checked={form.bringingRoommate === "false"} onChange={() => setForm((prev) => ({ ...prev, bringingRoommate: "false", totalPeople: "" }))} /> No
                  </label>
                </div>
              </div>

              <div className="ffield">
                <label>Laundry in Building? <span className="req">*</span></label>
                <div className="radio-row">
                  <label className="radio-opt">
                    <input type="radio" name="laundryInBuilding" checked={form.laundryInBuilding === "true"} onChange={() => setForm((prev) => ({ ...prev, laundryInBuilding: "true" }))} /> Yes
                  </label>
                  <label className="radio-opt">
                    <input type="radio" name="laundryInBuilding" checked={form.laundryInBuilding === "false"} onChange={() => setForm((prev) => ({ ...prev, laundryInBuilding: "false" }))} /> No
                  </label>
                </div>
              </div>

              {form.bringingRoommate === "true" ? (
                <div className="ffield">
                  <label>How Many Total People? <span className="req">*</span></label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    step={1}
                    value={form.totalPeople}
                    onChange={(event) => setForm((prev) => ({ ...prev, totalPeople: event.target.value }))}
                    placeholder="2 to 10"
                  />
                </div>
              ) : null}

              <div className="ffield full">
                <label>Your Room's Best Features <span className="req">*</span></label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.pitch}
                  onChange={(event) => setForm((prev) => ({ ...prev, pitch: event.target.value }))}
                  placeholder="Private bathroom, great view, close to classes..."
                />
              </div>

              <div className="ffield full">
                <label>Other Details</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={form.otherDetails}
                  onChange={(event) => setForm((prev) => ({ ...prev, otherDetails: event.target.value }))}
                  placeholder="Anything else worth sharing..."
                />
              </div>
            </div>
          </section>

          <section className="fsec">
            <h3 className="fsec-title">What You're Looking For</h3>
            <div className="fgrid">
              <div className="ffield">
                <label>Gender Housing <span className="req">*</span></label>
                <div className="checks-inline">
                  {["Male", "Female", "Gender Neutral"].map((gender) => (
                    <label className={`check-opt ${allowedGenders.has(gender) ? "" : "is-disabled"}`.trim()} key={gender}>
                      <input
                        type="checkbox"
                        disabled={!allowedGenders.has(gender)}
                        checked={form.wantedGenders.includes(gender)}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            wantedGenders: toggleFromArray(prev.wantedGenders, gender, event.target.checked),
                          }))
                        }
                      />
                      {gender}
                    </label>
                  ))}
                </div>
              </div>

              <div className="ffield full">
                <label>Campus Groups <span className="req">*</span></label>
                <p className="fhint">Selecting Any automatically selects all campus groups.</p>
                <div className="campus-group-blocks">
                  <label className="check-opt campus-any">
                    <input
                      type="checkbox"
                      checked={allCampusSelected}
                      onChange={(event) => handleAnyCampusToggle(event.target.checked)}
                    />
                    Any
                  </label>
                  {CAMPUS_GROUP_BLOCKS.map((block) => {
                    const groups = block.groups.filter((group) => CAMPUS_GROUPS.includes(group));
                    if (!groups.length) return null;

                    return (
                      <div key={block.title} className="campus-group-block">
                        <h4 className="campus-group-block-title">{block.title}</h4>
                        <div className="campus-group-check-list">
                          {groups.map((group) => (
                            <label key={group} className="check-opt">
                              <input
                                type="checkbox"
                                checked={form.wantedCampusGroups.includes(group)}
                                onChange={(event) => handleCampusGroupToggle(group, event.target.checked)}
                              />
                              {group}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {wantedLargeSelected ? (
                <div className="ffield full">
                  <label>Large Residence Areas <span className="req">*</span></label>
                  <div className="checks-inline checks-row">
                    {getLargeResidenceAreas().map((area) => (
                      <label key={area} className="check-opt">
                        <input
                          type="checkbox"
                          checked={form.wantedLargeResidenceAreas.includes(area)}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              wantedLargeResidenceAreas: toggleFromArray(
                                prev.wantedLargeResidenceAreas,
                                area,
                                event.target.checked
                              ),
                            }))
                          }
                        />
                        {area}
                      </label>
                    ))}
                  </div>

                  <label style={{ marginTop: 10 }}>Large Residence Building Names <span className="req">*</span></label>
                  <div className="checks-scroll">
                    {!wantedLargeBuildings.length ? (
                      <p className="fhint">Select at least one area first.</p>
                    ) : (
                      wantedLargeBuildings.map((building) => (
                        <label key={building.name} className="check-opt">
                          <input
                            type="checkbox"
                            checked={form.wantedLargeResidenceBuildings.includes(building.name)}
                            onChange={(event) =>
                              setForm((prev) => ({
                                ...prev,
                                wantedLargeResidenceBuildings: toggleFromArray(
                                  prev.wantedLargeResidenceBuildings,
                                  building.name,
                                  event.target.checked
                                ),
                              }))
                            }
                          />
                          {building.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div className="ffield full">
                <label>Layout Styles <span className="req">*</span></label>
                <div className="layout-style-grid">
                  {LAYOUT_COLUMNS.map((column) => {
                    const options = groupedWantedLayouts[column] || [];
                    return (
                      <div className="layout-col" key={column}>
                        <h4 className="layout-col-title">{column}</h4>
                        {!options.length ? (
                          <p className="layout-col-empty">No options</p>
                        ) : (
                          options.map((layout) => (
                            <label key={layout} className="check-opt">
                              <input
                                type="checkbox"
                                checked={form.wantedLayoutStyles.includes(layout)}
                                onChange={(event) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    wantedLayoutStyles: toggleFromArray(
                                      prev.wantedLayoutStyles,
                                      layout,
                                      event.target.checked
                                    ),
                                  }))
                                }
                              />
                              {layout}
                            </label>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="fsec">
            <h3 className="fsec-title">Contact Info</h3>
            <p className="fhint" style={{ marginBottom: "1rem" }}>
              Only visible to signed-in BU students. Your BU email is included automatically.
            </p>
            <div className="fgrid">
              <div className="ffield">
                <label>Reddit Username</label>
                <input
                  value={form.redditUsername}
                  onChange={(event) => setForm((prev) => ({ ...prev, redditUsername: event.target.value }))}
                  placeholder="u/yourname"
                />
              </div>
              <div className="ffield">
                <label>Phone Number</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="617-555-0123"
                />
              </div>
              <div className="ffield full">
                <label>Other</label>
                <input
                  value={form.otherContact}
                  onChange={(event) => setForm((prev) => ({ ...prev, otherContact: event.target.value }))}
                  placeholder="Instagram, Discord, Snapchat"
                />
              </div>
            </div>
          </section>

          <section className="fsec">
            <h3 className="fsec-title">Terms and Conditions</h3>
            <div className="terms-box">
              <p className="terms-lead">By proceeding, you affirm the following:</p>
              <ul className="terms-list">
                <li>You are a student at Boston University seeking a direct housing swap for the 2026-2027 academic year.</li>
                <li>You will respond to inquiries from students whose offers fit your preferences to remain an active participant.</li>
                <li>You will NOT offer any financial incentive for someone to trade with you. Doing so will immediately ban you from accessing this site</li>
                <li>You will not abuse contact information provided, or reach out for any reason other than housing inquiry.</li>
                <li>Direct Swap Connections reserves the right to deny access at any time. If you are not behaving as an engaged and respectful participant, you will be removed.</li>
              </ul>
              <p className="terms-foot">Not BU affiliated. Proceed at your own risk.</p>
              <label className="check-opt terms-check">
                <input
                  type="checkbox"
                  checked={form.agreedToTerms}
                  onChange={(event) => setForm((prev) => ({ ...prev, agreedToTerms: event.target.checked }))}
                />
                I agree to the terms and conditions above.
              </label>
            </div>
          </section>

          <div className="form-actions">
            <button type="submit" className="btn-red" disabled={busy}>
              {busy ? "Saving..." : myListing ? "Update Listing" : "Submit Listing"}
            </button>
            {myListing ? (
              <button type="button" className="btn-danger" onClick={handleDelete} disabled={busy}>
                Remove My Listing
              </button>
            ) : null}
          </div>

          {error ? <div className="msg msg-error" style={{ marginTop: "1rem" }}>{error}</div> : null}
        </form>
      </div>
    </div>
  );
}
