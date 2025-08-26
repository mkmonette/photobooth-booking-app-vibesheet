function validateContactStructured(contact: Contact | undefined): Record<string, string[]> {
  const errs: Record<string, string[]> = {};
  if (!contact) {
    errs.contactName = ["Contact information is required."];
    return errs;
  }

  const name = (contact.name || "").trim();
  const email = (contact.email || "").trim();
  const phone = (contact.phone || "").trim();

  if (!name) errs.contactName = ["Contact name is required."];

  if (!email) {
    errs.contactEmail = ["Contact email is required."];
  } else {
    // simple but practical email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) errs.contactEmail = ["Contact email must be a valid email address."];
  }

  if (phone) {
    // allow +, digits, spaces, parentheses and -; require at least 7 digits
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) errs.contactPhone = (errs.contactPhone || []).concat("Contact phone number must contain at least 7 digits.");
    // Note: dot (.) intentionally disallowed here to match the comment/intent
    const phoneRegex = /^[0-9()+\-\s]*$/;
    if (!phoneRegex.test(phone)) errs.contactPhone = (errs.contactPhone || []).concat("Contact phone contains invalid characters.");
  }

  return errs;
}

const defaultData: EventDetails = {
  eventName: "",
  date: "",
  startTime: "",
  endTime: "",
  guests: "",
  location: "",
  notes: "",
  contact: { name: "", email: "", phone: "" },
};

export default function EventDetailsForm({ initial, onChange, onValidate }: Props): JSX.Element {
  const mergedInitial = useMemo(() => {
    // deep-ish merge for contact
    const merged: EventDetails = {
      ...defaultData,
      ...(initial || {}),
      contact: {
        ...defaultData.contact,
        ...(initial?.contact || {}),
      },
    };
    // ensure guests is either number or ""
    if (merged.guests === null || merged.guests === undefined) merged.guests = "";
    return merged;
  }, [initial]);

  const [data, setData] = useState<EventDetails>(mergedInitial);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [flatErrors, setFlatErrors] = useState<string[]>([]);
  const [fieldErrorsMap, setFieldErrorsMap] = useState<Record<string, string[]>>({});

  // sync if initial prop changes
  useEffect(() => {
    setData(mergedInitial);
    setTouched({});
  }, [mergedInitial]);

  // notify parent of data changes
  useEffect(() => {
    onChange?.(data);
  }, [data, onChange]);

  // validate full form and notify via onValidate
  const validateAll = useCallback((current: EventDetails) => {
    const map: Record<string, string[]> = {};
    const list: string[] = [];

    const add = (field: string | undefined, message: string) => {
      if (field) {
        map[field] = (map[field] || []).concat(message);
      }
      list.push(message);
    };

    if (!current.eventName || !current.eventName.trim()) add("eventName", "Event name is required.");

    if (!current.date) add("date", "Event date is required.");

    if (!current.startTime) add("startTime", "Start time is required.");
    if (!current.endTime) add("endTime", "End time is required.");

    if (current.startTime && current.endTime) {
      // Validate format HH:MM (allow H:MM as well) and compare minutes
      const timeRegex = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;
      const sValid = timeRegex.test(current.startTime);
      const eValid = timeRegex.test(current.endTime);

      if (!sValid) add("startTime", "Start time must be in HH:MM (24-hour) format.");
      if (!eValid) add("endTime", "End time must be in HH:MM (24-hour) format.");

      if (sValid && eValid) {
        const parseTimeToMinutes = (t: string) => {
          const [hStr, mStr] = t.split(":");
          const hh = Number(hStr);
          const mm = Number(mStr);
          return hh * 60 + mm;
        };
        const s = parseTimeToMinutes(current.startTime);
        const e = parseTimeToMinutes(current.endTime);
        if (!Number.isFinite(s) || !Number.isFinite(e)) {
          if (!Number.isFinite(s)) add("startTime", "Start time is invalid.");
          if (!Number.isFinite(e)) add("endTime", "End time is invalid.");
        } else if (s > e) {
          add(undefined, "End time must be the same or after start time."); // general message not specific to one field
          // Also add to endTime field so UI can highlight it
          add("endTime", "End time must be the same or after start time.");
        }
      }
    }

    if (current.guests !== "" && current.guests !== undefined && current.guests !== null) {
      const guestsNum = typeof current.guests === "string" ? Number(current.guests) : current.guests;
      if (!Number.isFinite(guestsNum) || guestsNum < 0) add("guests", "Estimated guests must be a non-negative number.");
    }

    const contactMap = validateContactStructured(current.contact || undefined);
    Object.keys(contactMap).forEach((k) => {
      (contactMap[k] || []).forEach((m) => add(k, m));
    });

    return { map, list };
  }, []);

  // run validation when data changes and update errors state + notify parent
  useEffect(() => {
    const { map, list } = validateAll(data);
    setFieldErrorsMap(map);
    setFlatErrors(list);
    onValidate?.(list);
  }, [data, validateAll, onValidate]);

  const updateField = useCallback(<K extends keyof EventDetails>(key: K, value: EventDetails[K]) => {
    setData(prev => {
      const next = { ...prev, [key]: value };
      return next;
    });
  }, []);

  const updateContactField = useCallback(<K extends keyof Contact>(key: K, value: Contact[K]) => {
    setData(prev => ({
      ...prev,
      contact: {
        ...(prev.contact || {}),
        [key]: value,
      },
    }));
  }, []);

  const handleBlur = useCallback((name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }));
  }, []);

  // helpers to show error for a specific field
  const fieldErrors = useCallback(
    (field: string): string[] => {
      return fieldErrorsMap[field] || [];
    },
    [fieldErrorsMap]
  );

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const allTouched: Record<string, boolean> = {
      eventName: true,
      date: true,
      startTime: true,
      endTime: true,
      guests: true,
      location: true,
      notes: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
    };
    setTouched(allTouched);
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-describedby="event-form-errors"
    >
      <div className="field">
        <label htmlFor="eventName">Event name</label>
        <input
          id="eventName"
          name="eventName"
          type="text"
          value={data.eventName || ""}
          onChange={(e) => updateField("eventName", e.target.value)}
          onBlur={() => handleBlur("eventName")}
          aria-invalid={!!(touched.eventName && fieldErrors("eventName").length)}
          aria-required
          autoComplete="organization"
        />
        {touched.eventName && fieldErrors("eventName").map((m, i) => (
          <div key={i} className="error" role="alert">{m}</div>
        ))}
      </div>

      <div className="row">
        <div className="field half">
          <label htmlFor="date">Event date</label>
          <input
            id="date"
            name="date"
            type="date"
            value={data.date || ""}
            onChange={(e) => updateField("date", e.target.value)}
            onBlur={() => handleBlur("date")}
            aria-invalid={!!(touched.date && fieldErrors("date").length)}
            aria-required
          />
          {touched.date && fieldErrors("date").map((m, i) => (
            <div key={i} className="error" role="alert">{m}</div>
          ))}
        </div>

        <div className="field quarter">
          <label htmlFor="startTime">Start</label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            value={data.startTime || ""}
            onChange={(e) => updateField("startTime", e.target.value)}
            onBlur={() => handleBlur("startTime")}
            aria-invalid={!!(touched.startTime && fieldErrors("startTime").length)}
            aria-required
          />
          {touched.startTime && fieldErrors("startTime").map((m, i) => (
            <div key={i} className="error" role="alert">{m}</div>
          ))}
        </div>

        <div className="field quarter">
          <label htmlFor="endTime">End</label>
          <input
            id="endTime"
            name="endTime"
            type="time"
            value={data.endTime || ""}
            onChange={(e) => updateField("endTime", e.target.value)}
            onBlur={() => handleBlur("endTime")}
            aria-invalid={!!(touched.endTime && fieldErrors("endTime").length)}
            aria-required
          />
          {touched.endTime && fieldErrors("endTime").map((m, i) => (
            <div key={i} className="error" role="alert">{m}</div>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="guests">Estimated guests</label>
        <input
          id="guests"
          name="guests"
          type="number"
          min={0}
          step={1}
          value={data.guests === "" || data.guests === undefined ? "" : String(data.guests)}
          onChange={(e) => {
            const val = e.target.value;
            updateField("guests", val === "" ? "" : Number(val));
          }}
          onBlur={() => handleBlur("guests")}
          aria-invalid={!!(touched.guests && fieldErrors("guests").length)}
        />
        {touched.guests && fieldErrors("guests").map((m, i) => (
          <div key={i} className="error" role="alert">{m}</div>
        ))}
      </div>

      <div className="field">
        <label htmlFor="location">Location / venue</label>
        <input
          id="location"
          name="location"
          type="text"
          value={data.location || ""}
          onChange={(e) => updateField("location", e.target.value)}
          onBlur={() => handleBlur("location")}
          aria-invalid={!!(touched.location && fieldErrors("location").length)}
          autoComplete="street-address"
        />
        {touched.location && fieldErrors("location").map((m, i) => (
          <div key={i} className="error" role="alert">{m}</div>
        ))}
      </div>

      <div className="field">
        <label htmlFor="notes">Notes (internal)</label>
        <textarea
          id="notes"
          name="notes"
          value={data.notes || ""}
          onChange={(e) => updateField("notes", e.target.value)}
          onBlur={() => handleBlur("notes")}
          rows={4}
        />
      </div>

      <fieldset className="contact" aria-labelledby="contact-heading">
        <legend id="contact-heading">Primary contact</legend>

        <div className="field">
          <label htmlFor="contactName">Name</label>
          <input
            id="contactName"
            name="contactName"
            type="text"
            value={data.contact?.name || ""}
            onChange={(e) => updateContactField("name", e.target.value)}
            onBlur={() => handleBlur("contactName")}
            aria-invalid={!!(touched.contactName && fieldErrors("contactName").length)}
            aria-required
          />
          {touched.contactName && fieldErrors("contactName").map((m, i) => (
            <div key={i} className="error" role="alert">{m}</div>
          ))}
        </div>

        <div className="field">
          <label htmlFor="contactEmail">Email</label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            value={data.contact?.email || ""}
            onChange={(e) => updateContactField("email", e.target.value)}
            onBlur={() => handleBlur("contactEmail")}
            aria-invalid={!!(touched.contactEmail && fieldErrors("contactEmail").length)}
            aria-required
            autoComplete="email"
          />
          {touched.contactEmail && fieldErrors("contactEmail").map((m, i) => (
            <div key={i} className="error" role="alert">{m}</div>
          ))}
        </div>

        <div className="field">
          <label htmlFor="contactPhone">Phone (optional)</label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            value={data.contact?.phone || ""}
            onChange={(e) => updateContactField("phone", e.target.value)}
            onBlur={() => handleBlur("contactPhone")}
            aria-invalid={!!(touched.contactPhone && fieldErrors("contactPhone").length)}
            autoComplete="tel"
          />
          {touched.contactPhone && fieldErrors("contactPhone").map((m, i) => (
            <div key={i} className="error" role="alert">{m}</div>
          ))}
        </div>
      </fieldset>

      <div id="event-form-errors" aria-live="polite" style={{ display: flatErrors.length ? "block" : "none" }}>
        {flatErrors.length > 0 && (
          <ul className="error-list">
            {flatErrors.map((e, i) => (
              <li key={i} className="error">{e}</li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}