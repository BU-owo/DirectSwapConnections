/**
 * Submit Page
 * Collects current housing + preferences, validates constraints, and saves listing/contact data.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  BUILDINGS,
  CAMPUS_GROUPS,
  LARGE_STYLE_AREAS,
  getBuildingByAddress,
  getBuildingsForGroup,
  getLayoutsForAddress,
  getLayoutsForGroups,
  getLayoutsForBuildingNames,
  getBuildingsWithApartmentLayouts,
  getCampusGroupsWithOccupancy,
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

const FENWAY_CAMPUS_GROUP = "Fenway Campus";
const STUDENT_VILLAGE_GROUP = "Student Village";
const BUILD_LEVEL_GROUPS = new Set([LARGE_STYLE_RESIDENCES_GROUP, FENWAY_CAMPUS_GROUP, STUDENT_VILLAGE_GROUP]);
const LAYOUT_OCCUPANCY_FILTERS = ["Single", "Double", "Triple", "Quad"];

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
  totalPeople: "",
  pitch: "",
  otherDetails: "",
  wantedGenders: [],
  wantedCampusGroups: [],
  wantedLargeResidenceAreas: [],
  wantedLargeResidenceBuildings: [],
  wantedLayoutStyles: [],
  wantedOtherDetails: "",
  redditUsername: "",
  phone: "",
  otherContact: "",
  agreedToTerms: false,
};

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * Splits a layout string so type/occupancy can be ordered consistently in dropdowns.
 */
function splitLayout(layout) {
  const parts = String(layout || "").trim().split(" ");
  if (parts.length < 2) return { layoutType: layout, occupancy: "" };
  return {
    occupancy: parts[parts.length - 1],
    layoutType: parts.slice(0, -1).join(" "),
  };
}

/**
 * Sorts layout options by design type first, then occupancy (Single -> Quad), then alphabetically.
 */
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

/**
 * Checkbox helper: returns a next array with value inserted/removed based on checked state.
 */
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
  const [quickOccupancies, setQuickOccupancies] = useState([]);
  const [quickRoomTypes, setQuickRoomTypes] = useState([]);
  const [layoutOccupancyFilters, setLayoutOccupancyFilters] = useState([]);

  // Keep form state synchronized with auth/listing context transitions.
  useEffect(() => {
    if (!user) {
      setForm(DEFAULT_FORM);
      setQuickOccupancies([]);
      setQuickRoomTypes([]);
      setLayoutOccupancyFilters([]);
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
      setQuickOccupancies([]);
      setQuickRoomTypes([]);
      setLayoutOccupancyFilters([]);
      return;
    }

    const contact = contactsMap[user.uid] || {};
    setQuickOccupancies([]);
    setQuickRoomTypes([]);
    setLayoutOccupancyFilters([]);
    setForm({
      housingGender: myListing.housingGender || "",
      currentCampusGroup: myListing.currentCampusGroup || "",
      currentLargeResidenceArea: myListing.currentLargeResidenceArea || "",
      currentAddress: myListing.currentAddress || "",
      layout: myListing.layout || "",
      bringingRoommate: String(Boolean(myListing.bringingRoommate)),
      totalPeople: myListing.totalPeople ? String(myListing.totalPeople) : "",
      pitch: myListing.pitch || "",
      otherDetails: myListing.otherDetails || "",
      wantedGenders: myListing.wantedGenders || [],
      wantedCampusGroups: myListing.wantedCampusGroups || [],
      wantedLargeResidenceAreas: myListing.wantedLargeResidenceAreas || [],
      wantedLargeResidenceBuildings: myListing.wantedLargeResidenceBuildings || [],
      wantedLayoutStyles: myListing.wantedLayoutStyles || [],
      wantedOtherDetails: myListing.wantedOtherDetails || "",
      redditUsername: contact.redditUsername || "",
      phone: contact.phone || "",
      otherContact: contact.otherContact || "",
      agreedToTerms: true,
    });
  }, [contactsMap, myListing, user]);

  const isLargeCurrent = form.currentCampusGroup === LARGE_STYLE_RESIDENCES_GROUP;
  const isNamedBuilding = [LARGE_STYLE_RESIDENCES_GROUP, "Fenway Campus", "Student Village"].includes(form.currentCampusGroup);

  // Current address options depend on selected campus group.
  const currentAddresses = useMemo(() => {
    if (!form.currentCampusGroup) return [];
    return getBuildingsForGroup(form.currentCampusGroup);
  }, [form.currentCampusGroup]);

  const currentLayouts = useMemo(() => {
    if (!form.currentAddress) return [];
    return orderLayouts(getLayoutsForAddress(form.currentAddress));
  }, [form.currentAddress]);

  const availableWantedLayouts = useMemo(() => {
    const regularGroups = form.wantedCampusGroups.filter((g) => !BUILD_LEVEL_GROUPS.has(g));
    const fromGroups = regularGroups.length ? getLayoutsForGroups(regularGroups) : [];
    const fromBuildings = form.wantedLargeResidenceBuildings.length
      ? getLayoutsForBuildingNames(form.wantedLargeResidenceBuildings)
      : [];
    return orderLayouts([...new Set([...fromGroups, ...fromBuildings])]);
  }, [form.wantedCampusGroups, form.wantedLargeResidenceBuildings]);

  useEffect(() => {
    setForm((prev) => {
      const allowed = new Set(availableWantedLayouts);
      const nextLayouts = prev.wantedLayoutStyles.filter((layout) => allowed.has(layout));
      if (nextLayouts.length === prev.wantedLayoutStyles.length) return prev;
      return { ...prev, wantedLayoutStyles: nextLayouts };
    });
  }, [availableWantedLayouts]);

  useEffect(() => {
    const nextManagedLayouts = availableWantedLayouts.filter((layout) => {
      const { occupancy } = splitLayout(layout);
      return layoutOccupancyFilters.includes(occupancy);
    });

    setForm((prev) => {
      const nextLayouts = [...new Set([...prev.wantedLayoutStyles, ...nextManagedLayouts])];

      if (
        nextLayouts.length === prev.wantedLayoutStyles.length &&
        nextLayouts.every((layout, index) => layout === prev.wantedLayoutStyles[index])
      ) {
        return prev;
      }

      return { ...prev, wantedLayoutStyles: nextLayouts };
    });
  }, [availableWantedLayouts, layoutOccupancyFilters]);

  useEffect(() => {
    setForm((prev) => {
      const allowed = allowedWantedGenders(prev.housingGender);
      const nextWanted = prev.wantedGenders.filter((gender) => allowed.has(gender));
      if (nextWanted.length === prev.wantedGenders.length) return prev;
      return { ...prev, wantedGenders: nextWanted };
    });
  }, [form.housingGender]);

  const allowedGenders = allowedWantedGenders(form.housingGender);

  // All possible layouts across all buildings — used to compute quick filter cross-products.
  const allPossibleLayouts = useMemo(() => orderLayouts(getLayoutsForGroups(CAMPUS_GROUPS)), []);

  /**
   * Applies quick filters using AND intersection logic (same as BrowsePage).
   * quickRoomTypes: ["Apartment", "Studio"] for apartment button; occupancy types for occupancy buttons.
   * Matching layouts = intersection of active occupancies × active roomTypes.
   */
  function applyQuickFilters(newOccupancies, newRoomTypes) {
    const matchingLayouts = (newOccupancies.length === 0 && newRoomTypes.length === 0)
      ? []
      : allPossibleLayouts.filter((layout) => {
          const { layoutType, occupancy } = splitLayout(layout);
          const typeKey = layoutType.replace(/-/g, " ");
          const roomTypeMatch = newRoomTypes.length === 0 || newRoomTypes.some((rt) => rt === typeKey || rt === layoutType);
          const occupancyMatch = newOccupancies.length === 0 || newOccupancies.includes(occupancy);
          return roomTypeMatch && occupancyMatch;
        });

    const matchingCampusGroups = matchingLayouts.length
      ? [...new Set(BUILDINGS.filter((b) => b.layouts.some((l) => matchingLayouts.includes(l))).map((b) => b.group))]
      : [];

    // For build-level groups (Large Traditional, Fenway), populate wantedLargeResidenceBuildings.
    const buildLevelBuildings = BUILDINGS
      .filter((b) => BUILD_LEVEL_GROUPS.has(b.group) && b.layouts.some((l) => matchingLayouts.includes(l)))
      .map((b) => b.name);

    setForm((prev) => ({
      ...prev,
      wantedCampusGroups: matchingCampusGroups,
      wantedLargeResidenceBuildings: buildLevelBuildings,
      wantedLayoutStyles: matchingLayouts,
    }));
  }

  function handleCurrentGroupChange(value) {
    setForm((prev) => ({
      ...prev,
      currentCampusGroup: value,
      currentAddress: "",
      layout: "",
    }));
  }

  function handleAnyCampusToggle(checked) {
    setForm((prev) => {
      const allBuildingGroupBuildings = checked
        ? [LARGE_STYLE_RESIDENCES_GROUP, FENWAY_CAMPUS_GROUP, STUDENT_VILLAGE_GROUP].flatMap(
            (group) => getBuildingsForGroup(group).map((b) => b.name)
          )
        : [];
      return {
        ...prev,
        wantedCampusGroups: checked ? [...CAMPUS_GROUPS] : [],
        wantedLargeResidenceBuildings: allBuildingGroupBuildings,
      };
    });
  }

  function handleBuildingToggle(buildingName, campusGroup, checked) {
    setForm((prev) => {
      const nextBuildings = toggleFromArray(prev.wantedLargeResidenceBuildings, buildingName, checked);
      const groupBuildingNames = getBuildingsForGroup(campusGroup).map((b) => b.name);
      const groupHasAny = nextBuildings.some((name) => groupBuildingNames.includes(name));
      const nextGroups = toggleFromArray(prev.wantedCampusGroups, campusGroup, groupHasAny);
      return { ...prev, wantedLargeResidenceBuildings: nextBuildings, wantedCampusGroups: nextGroups };
    });
  }

  function handleCampusGroupToggle(group, checked) {
    setForm((prev) => {
      const nextGroups = toggleFromArray(prev.wantedCampusGroups, group, checked);
      let nextBuildings = prev.wantedLargeResidenceBuildings;
      if (BUILD_LEVEL_GROUPS.has(group)) {
        const groupBuildingNames = getBuildingsForGroup(group).map((b) => b.name);
        nextBuildings = checked
          ? [...new Set([...nextBuildings, ...groupBuildingNames])]
          : nextBuildings.filter((name) => !groupBuildingNames.includes(name));
      }
      return { ...prev, wantedCampusGroups: nextGroups, wantedLargeResidenceBuildings: nextBuildings };
    });
  }

  function isCampusGroupFullySelected(group, formState = form) {
    if (!BUILD_LEVEL_GROUPS.has(group)) {
      return formState.wantedCampusGroups.includes(group);
    }

    const groupBuildings = getBuildingsForGroup(group).map((building) => building.name);
    return groupBuildings.length > 0 && groupBuildings.every((name) => formState.wantedLargeResidenceBuildings.includes(name));
  }

  function handleCampusBlockToggle(groups, checked) {
    setForm((prev) => {
      const nextGroups = new Set(prev.wantedCampusGroups);
      const nextBuildings = new Set(prev.wantedLargeResidenceBuildings);

      groups.forEach((group) => {
        if (checked) {
          nextGroups.add(group);
        } else {
          nextGroups.delete(group);
        }

        if (BUILD_LEVEL_GROUPS.has(group)) {
          getBuildingsForGroup(group).forEach((building) => {
            if (checked) {
              nextBuildings.add(building.name);
            } else {
              nextBuildings.delete(building.name);
            }
          });
        }
      });

      return {
        ...prev,
        wantedCampusGroups: [...nextGroups],
        wantedLargeResidenceBuildings: [...nextBuildings],
      };
    });
  }

  function validateForm() {
    // Validate progressive dependencies in the same order users complete the form.
    const totalPeople = Number(form.totalPeople);

    if (!form.housingGender) return "Select your housing assignment gender.";
    if (!form.currentCampusGroup) return "Select your campus group.";
    if (!form.currentAddress) return "Select your current address.";
    if (!form.layout) return "Select your room layout.";
    if (!form.bringingRoommate) return "Indicate whether you are bringing a roommate.";
    if (form.bringingRoommate === "true") {
      if (!Number.isInteger(totalPeople) || totalPeople < 2 || totalPeople > 8) {
        return "If bringing a roommate, total people must be a whole number from 2 to 8.";
      }
    }
    if (!form.pitch.trim()) return "Describe your room's best features.";
    if (!form.wantedGenders.length) return "Select at least one gender housing preference.";
    if (!form.wantedCampusGroups.length) return "Select at least one campus group you would consider.";
    if (!form.wantedLayoutStyles.length) return "Select at least one layout style you would consider.";
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

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    try {
      // Build normalized payloads before Firestore writes.
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
      setQuickOccupancies([]);
      setQuickRoomTypes([]);
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

  function handleLayoutColumnToggle(layouts) {
    if (!layouts.length) return;

    setForm((prev) => {
      const allSelected = layouts.every((layout) => prev.wantedLayoutStyles.includes(layout));
      const nextLayoutStyles = allSelected
        ? prev.wantedLayoutStyles.filter((layout) => !layouts.includes(layout))
        : [...new Set([...prev.wantedLayoutStyles, ...layouts])];

      return {
        ...prev,
        wantedLayoutStyles: nextLayoutStyles,
      };
    });
  }

  function handleLayoutColumnKeyDown(event, layouts) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleLayoutColumnToggle(layouts);
  }

  function stopLayoutColumnToggle(event) {
    event.stopPropagation();
  }

  function handleCampusBlockCardToggle(isBuildingLevel, groups, checked) {
    if (isBuildingLevel) {
      handleCampusGroupToggle(groups[0], checked);
      return;
    }

    handleCampusBlockToggle(groups, checked);
  }

  function handleCampusBlockCardKeyDown(event, isBuildingLevel, groups, checked) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleCampusBlockCardToggle(isBuildingLevel, groups, checked);
  }

  function stopCampusBlockToggle(event) {
    event.stopPropagation();
  }

  function handleLayoutOccupancyToggle(occupancy) {
    const matchingLayouts = availableWantedLayouts.filter((layout) => splitLayout(layout).occupancy === occupancy);

    setLayoutOccupancyFilters((prev) => {
      const isActive = prev.includes(occupancy);

      setForm((currentForm) => ({
        ...currentForm,
        wantedLayoutStyles: isActive
          ? currentForm.wantedLayoutStyles.filter((layout) => !matchingLayouts.includes(layout))
          : [...new Set([...currentForm.wantedLayoutStyles, ...matchingLayouts])],
      }));

      return isActive ? prev.filter((item) => item !== occupancy) : [...prev, occupancy];
    });
  }

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

              <div className="ffield">
                <label>{isNamedBuilding ? "Current Building Name" : "Current Address"} <span className="req">*</span></label>
                <select
                  value={form.currentAddress}
                  disabled={!form.currentCampusGroup}
                  onChange={(event) => setForm((prev) => ({ ...prev, currentAddress: event.target.value, layout: "" }))}
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
                  ? <p className="fhint">Your building name will be visible on your listing.</p>
                  : <p className="fhint">Your address will be kept private. It is only used to select the correct layout options.</p>
                }
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

              {form.bringingRoommate === "true" ? (
                <div className="ffield">
                  <label>How Many Total People? <span className="req">*</span></label>
                  <input
                    type="number"
                    min={2}
                    max={8}
                    step={1}
                    value={form.totalPeople}
                    onChange={(event) => setForm((prev) => ({ ...prev, totalPeople: event.target.value }))}
                    placeholder="2 to 8"
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
            <div className="quick-filters-section">
              <h3 className="section-title">Quick Filters</h3>
              <div className="quick-filters">
                <button
                  className={`quick-filter-btn ${quickRoomTypes.includes("Apartment") ? "active" : ""}`}
                  onClick={() => {
                    const isActive = quickRoomTypes.includes("Apartment");
                    const newRoomTypes = isActive
                      ? quickRoomTypes.filter((rt) => rt !== "Apartment" && rt !== "Studio")
                      : [...new Set([...quickRoomTypes, "Apartment", "Studio"])];
                    setQuickRoomTypes(newRoomTypes);
                    applyQuickFilters(quickOccupancies, newRoomTypes);
                  }}
                >
                  Any Apartment
                </button>
                <button
                  className={`quick-filter-btn ${quickOccupancies.includes("Single") ? "active" : ""}`}
                  onClick={() => {
                    const isActive = quickOccupancies.includes("Single");
                    const newOccupancies = isActive
                      ? quickOccupancies.filter((o) => o !== "Single")
                      : [...quickOccupancies, "Single"];
                    setQuickOccupancies(newOccupancies);
                    applyQuickFilters(newOccupancies, quickRoomTypes);
                  }}
                >
                  Any Single
                </button>
                <button
                  className={`quick-filter-btn ${quickOccupancies.includes("Double") ? "active" : ""}`}
                  onClick={() => {
                    const isActive = quickOccupancies.includes("Double");
                    const newOccupancies = isActive
                      ? quickOccupancies.filter((o) => o !== "Double")
                      : [...quickOccupancies, "Double"];
                    setQuickOccupancies(newOccupancies);
                    applyQuickFilters(newOccupancies, quickRoomTypes);
                  }}
                >
                  Any Double
                </button>
                <button
                  className={`quick-filter-btn ${quickOccupancies.includes("Triple") ? "active" : ""}`}
                  onClick={() => {
                    const isActive = quickOccupancies.includes("Triple");
                    const newOccupancies = isActive
                      ? quickOccupancies.filter((o) => o !== "Triple")
                      : [...quickOccupancies, "Triple"];
                    setQuickOccupancies(newOccupancies);
                    applyQuickFilters(newOccupancies, quickRoomTypes);
                  }}
                >
                  Any Triple
                </button>
              </div>
            </div>

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
                    const isBuildingLevel = groups.length === 1 && BUILD_LEVEL_GROUPS.has(groups[0]);
                    const blockAllSelected = groups.every((group) => isCampusGroupFullySelected(group));
                    const selectAllChecked = isBuildingLevel
                      ? isCampusGroupFullySelected(groups[0])
                      : blockAllSelected;
                    const handleSelectAllChange = isBuildingLevel
                      ? (event) => handleCampusGroupToggle(groups[0], event.target.checked)
                      : (event) => handleCampusBlockToggle(groups, event.target.checked);

                    return (
                      <div
                        key={block.title}
                        className={`campus-group-block campus-group-block-selectable ${selectAllChecked ? "is-selected" : ""}`.trim()}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selectAllChecked}
                        aria-label={`${selectAllChecked ? "Clear" : "Select"} all ${block.title.toLowerCase()}`}
                        onClick={() => handleCampusBlockCardToggle(isBuildingLevel, groups, !selectAllChecked)}
                        onKeyDown={(event) => handleCampusBlockCardKeyDown(event, isBuildingLevel, groups, !selectAllChecked)}
                      >
                        <div className="campus-group-block-head">
                          <h4 className="campus-group-block-title">{block.title}</h4>
                          <button
                            type="button"
                            className="campus-select-all-btn"
                            aria-pressed={selectAllChecked}
                            aria-label={`${selectAllChecked ? "Clear" : "Select"} all ${block.title.toLowerCase()}`}
                            onClick={(event) => {
                              stopCampusBlockToggle(event);
                              handleSelectAllChange({ target: { checked: !selectAllChecked } });
                            }}
                          >
                            <span className={`layout-col-toggle ${selectAllChecked ? "is-active" : ""}`.trim()}>
                              All
                            </span>
                          </button>
                        </div>
                        <div className="campus-group-check-list">
                          {isBuildingLevel ? (() => {
                            const group = groups[0];
                            const groupBuildings = getBuildingsForGroup(group)
                              .sort((a, b) => collator.compare(a.name, b.name));
                            return (
                              <>
                                {groupBuildings.map((building) => (
                                  <label key={building.name} className="check-opt" onClick={stopCampusBlockToggle}>
                                    <input
                                      type="checkbox"
                                      checked={form.wantedLargeResidenceBuildings.includes(building.name)}
                                      onClick={stopCampusBlockToggle}
                                      onChange={(event) => handleBuildingToggle(building.name, group, event.target.checked)}
                                    />
                                    {building.name}
                                  </label>
                                ))}
                              </>
                            );
                          })() : (
                            <>
                              {groups.flatMap((group) => {
                                if (group === STUDENT_VILLAGE_GROUP) {
                                  return getBuildingsForGroup(group)
                                    .sort((a, b) => collator.compare(a.name, b.name))
                                    .map((building) => (
                                      <label key={building.name} className="check-opt" onClick={stopCampusBlockToggle}>
                                        <input
                                          type="checkbox"
                                          checked={form.wantedLargeResidenceBuildings.includes(building.name)}
                                          onClick={stopCampusBlockToggle}
                                          onChange={(event) => handleBuildingToggle(building.name, group, event.target.checked)}
                                        />
                                        {building.name}
                                      </label>
                                    ));
                                }

                                return (
                                  <label key={group} className="check-opt" onClick={stopCampusBlockToggle}>
                                    <input
                                      type="checkbox"
                                      checked={form.wantedCampusGroups.includes(group)}
                                      onClick={stopCampusBlockToggle}
                                      onChange={(event) => handleCampusGroupToggle(group, event.target.checked)}
                                    />
                                    {group}
                                  </label>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="ffield full">
                <div className="layout-section-head">
                  <label>Layout Styles <span className="req">*</span></label>
                  <div className="layout-occupancy-toggles" aria-label="Layout occupancy toggles">
                    {LAYOUT_OCCUPANCY_FILTERS.map((occupancy) => {
                      const isActive = layoutOccupancyFilters.includes(occupancy);
                      return (
                        <button
                          key={occupancy}
                          type="button"
                          className="layout-occupancy-toggle-btn"
                          aria-pressed={isActive}
                          onClick={() => handleLayoutOccupancyToggle(occupancy)}
                        >
                          <span className={`layout-col-toggle ${isActive ? "is-active" : ""}`.trim()}>
                            {occupancy}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="layout-style-grid">
                  {LAYOUT_COLUMNS.map((column) => {
                    const options = groupedWantedLayouts[column] || [];
                    const allSelected = options.length > 0 && options.every((layout) => form.wantedLayoutStyles.includes(layout));
                    return (
                      <div
                        className={`layout-col layout-col-selectable ${allSelected ? "is-selected" : ""}`.trim()}
                        key={column}
                        role="button"
                        tabIndex={options.length ? 0 : -1}
                        aria-pressed={allSelected}
                        aria-label={`${allSelected ? "Clear" : "Select"} all available ${column} layout styles`}
                        onClick={() => handleLayoutColumnToggle(options)}
                        onKeyDown={(event) => handleLayoutColumnKeyDown(event, options)}
                      >
                        <div className="layout-col-head">
                          <h4 className="layout-col-title">{column}</h4>
                          {options.length ? (
                            <span className={`layout-col-toggle ${allSelected ? "is-active" : ""}`.trim()}>
                              All
                            </span>
                          ) : null}
                        </div>
                        {!options.length ? (
                          <p className="layout-col-empty">No options</p>
                        ) : (
                          options.map((layout) => (
                            <label key={layout} className="check-opt" onClick={stopLayoutColumnToggle}>
                              <input
                                type="checkbox"
                                checked={form.wantedLayoutStyles.includes(layout)}
                                onClick={stopLayoutColumnToggle}
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

              <div className="ffield full">
                <label>Additional Details</label>
                <textarea
                  value={form.wantedOtherDetails || ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, wantedOtherDetails: event.target.value }))}
                  placeholder="Any other specific requirements or preferences..."
                  rows={3}
                />
              </div>
            </div>
          </section>

          <section className="fsec">
            <h3 className="fsec-title">Contact Info</h3>
            <p className="fhint" style={{ marginBottom: "1rem" }}>
              <strong>Optional.</strong> Only visible to signed-in BU students. Your BU email is included automatically.
            </p>
            <div className="fgrid">
              <div className="ffield">
                <label>Phone Number</label>
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="617-555-0123"
                />
              </div>
              <div className="ffield">
                <label>Reddit Username</label>
                <input
                  value={form.redditUsername}
                  onChange={(event) => setForm((prev) => ({ ...prev, redditUsername: event.target.value }))}
                  placeholder="u/yourname"
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
                <li>Terrier Housing reserves the right to deny access at any time. If you are not behaving as an engaged and respectful participant, you will be removed.</li>
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
