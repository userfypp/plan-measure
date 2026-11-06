import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { Button, Dialog, Input, Select, type SelectOption } from "../../components/ui";
import { SearchSelect } from "../../components/ui/SearchSelect";
import type {
  ClassificationValueDerivation,
  ClassificationValuePrice,
  ClassificationValueRates,
  DerivedQuantitySource,
  MeasurementDisplayUnit,
  PriceBasis,
  PriceUnit,
} from "../../types/domain";
import { priceUnitsFor } from "../../utils/classificationRates";
import { currencyOptions } from "../../utils/currencies";
import { resolveLinearUnit } from "../../utils/format";
import { fromMillimetres, toMillimetres } from "../../utils/units";
import styles from "./ClassificationValueRatesDialog.module.css";

export interface ClassificationValueRatesDialogProps {
  /** The edited value; a different one reloads the form without reopening the dialog. */
  valueId: string;
  /** Dimension and value names, shown so the dialog says what it edits. */
  dimensionName: string;
  valueName: string;
  /** The value's current rates, if it has any. */
  rates: ClassificationValueRates | undefined;
  /** The project's unit; the height or thickness is typed in it (feet & inches use feet). */
  displayUnit: MeasurementDisplayUnit;
  /** The project's currency; without one, a price needs a currency chosen here. */
  currency: string | null;
  /**
   * Stores the rates; false when the session rejects them. The currency is the one chosen here
   * for a project without one, otherwise null.
   */
  onSave: (
    derivation: ClassificationValueDerivation | null,
    price: ClassificationValuePrice | null,
    currency: string | null,
  ) => boolean;
  onClose: () => void;
  /** The value "Save and next" opens, as "Dimension · Value"; absent when there is none. */
  next?: { label: string };
  /** Called after "Save and next" has saved; the caller then passes the next value. */
  onNext?: () => void;
}

type DerivationChoice = DerivedQuantitySource | "none";

interface FieldErrors {
  factor?: string;
  price?: string;
  currency?: string;
}

const DERIVATION_OPTIONS: ReadonlyArray<{ value: DerivationChoice; label: string }> = [
  { value: "none", label: "None" },
  { value: "length", label: "Area from length" },
  { value: "perimeter", label: "Area from perimeter" },
  { value: "area", label: "Volume from area" },
];

const BASIS_OPTIONS: ReadonlyArray<{ value: Exclude<PriceBasis, "derived">; label: string }> = [
  { value: "length", label: "Length" },
  { value: "perimeter", label: "Perimeter" },
  { value: "area", label: "Area" },
  { value: "count", label: "Count" },
];

const CLOUDS = "Clouds count only when Measure clouds is on.";

/** What each derived quantity multiplies, shown under the select and as the option's tooltip. */
const DERIVATION_TEXT: Record<DerivationChoice, string> = {
  none: "No derived quantity: only the measured totals are used.",
  length:
    "Total length of the lines and polylines assigned to this value, times a height, gives an area. Example: a wall drawn as a line.",
  perimeter: `Total perimeter of the closed shapes assigned to this value, times a height, gives an area. Example: the walls around a room. ${CLOUDS}`,
  area: `Total area of the closed shapes assigned to this value, times a thickness, gives a volume. Example: a floor slab. ${CLOUDS}`,
};

/** The quantity a unit price multiplies, shown under the select and as the option's tooltip. */
const BASIS_TEXT: Record<Exclude<PriceBasis, "derived">, string> = {
  length: "Total length of the lines and polylines assigned to this value.",
  perimeter: `Total perimeter of the closed shapes assigned to this value. ${CLOUDS}`,
  area: `Total area of the closed shapes assigned to this value. ${CLOUDS}`,
  count: "Number of count markers assigned to this value: the price is per item, such as per door.",
};
const DERIVED_TEXT = {
  area: "The derived area above: length or perimeter times the height.",
  volume: "The derived volume above: area times the thickness.",
};

/** The linear unit a price unit is built on (`ft²` is `ft`); none for acres and each. */
function linearOf(unit: PriceUnit): string | null {
  const linear = unit.replace(/[²³]$/, "");
  return linear === "ac" || linear === "each" ? null : linear;
}

function CurrencyField({
  id,
  value,
  error,
  onChange,
}: {
  id: string;
  value: string;
  error: string | undefined;
  onChange: (code: string) => void;
}) {
  const labelId = useId();
  const options = useMemo(
    () => [
      ...currencyOptions().map(({ code, name }) => ({ value: code, label: `${name} (${code})` })),
    ],
    [],
  );
  return (
    <>
      <div className={styles.field}>
        <span id={labelId} className={styles.label}>
          Currency
        </span>
        <SearchSelect
          id={id}
          label="Currency"
          labelledBy={labelId}
          value={value}
          options={options}
          placeholder="Choose a currency"
          searchLabel="Search currencies"
          emptyLabel="No currency matches"
          onChange={onChange}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function RatesForm({
  formId,
  factorRef,
  rates,
  displayUnit,
  currency,
  onSave,
  onSaved,
}: {
  formId: string;
  factorRef: RefObject<HTMLInputElement | null>;
  rates: ClassificationValueRates | undefined;
  displayUnit: MeasurementDisplayUnit;
  currency: string | null;
  onSave: ClassificationValueRatesDialogProps["onSave"];
  onSaved: () => void;
}) {
  const unit = resolveLinearUnit(displayUnit);
  const [initialText] = useState(() =>
    rates?.derivation ? String(fromMillimetres(rates.derivation.factorMm, unit)) : "",
  );
  const [source, setSource] = useState<DerivationChoice>(rates?.derivation?.source ?? "none");
  const [factorText, setFactorText] = useState(initialText);
  const [priceText, setPriceText] = useState(rates?.price ? String(rates.price.amount) : "");
  // What the user picked; null until then, so the defaults follow the derivation.
  const [basisChoice, setBasisChoice] = useState<PriceBasis | null>(rates?.price?.basis ?? null);
  const [unitChoice, setUnitChoice] = useState<PriceUnit | null>(rates?.price?.unit ?? null);
  const [newCurrency, setNewCurrency] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const labelId = useId();
  const basisLabelId = useId();
  const sourceHintId = useId();
  const basisHintId = useId();
  const unitLabelId = useId();
  const factorLabel = source === "area" ? "Thickness" : "Height";

  // Only the source decides which units a derived price can use; the factor is checked on save.
  const draftDerivation: ClassificationValueDerivation | null =
    source === "none" ? null : { source, factorMm: 1 };
  const derivedKind = source === "area" ? "volume" : "area";
  const basisOptions: SelectOption<PriceBasis>[] = [
    ...BASIS_OPTIONS.map((option) => ({ ...option, tooltip: BASIS_TEXT[option.value] })),
    ...(draftDerivation
      ? [
          {
            value: "derived" as const,
            label: `Derived ${derivedKind}`,
            tooltip: DERIVED_TEXT[derivedKind],
          },
        ]
      : []),
  ];
  const basis: PriceBasis =
    basisChoice !== null && (basisChoice !== "derived" || draftDerivation !== null)
      ? basisChoice
      : draftDerivation
        ? "derived"
        : "area";
  const unitsForBasis = priceUnitsFor(basis, draftDerivation);
  // The chosen unit's linear part survives a change of basis or derivation (ft² becomes ft).
  const chosenLinear = unitChoice ? linearOf(unitChoice) : null;
  const priceUnit: PriceUnit =
    (unitChoice && unitsForBasis.includes(unitChoice) ? unitChoice : undefined) ??
    unitsForBasis.find(
      (candidate) => chosenLinear !== null && linearOf(candidate) === chosenLinear,
    ) ??
    unitsForBasis.find((candidate) => linearOf(candidate) === unit) ??
    unitsForBasis[0]!;
  const hasPriceText = priceText.trim() !== "";
  // A price per derived quantity loses its basis with the derivation; the user chooses a new one.
  const basisLost = hasPriceText && basisChoice === "derived" && draftDerivation === null;
  const needsCurrency = currency === null && hasPriceText;
  const shownCurrency = currency ?? newCurrency;

  function edit(change: () => void, field?: keyof FieldErrors) {
    change();
    setErrors((current) => (field ? { ...current, [field]: undefined } : current));
    setSaveError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: FieldErrors = {};
    let derivation: ClassificationValueDerivation | null = null;
    if (source !== "none") {
      const text = factorText.trim();
      if (!text) {
        next.factor = `Enter a ${factorLabel.toLowerCase()}.`;
      } else {
        const value = Number(text);
        const factorMm =
          // Unchanged text keeps the stored millimetres, which a round trip through the unit may not.
          rates?.derivation && text === initialText
            ? rates.derivation.factorMm
            : toMillimetres(value, unit);
        if (!Number.isFinite(value) || !Number.isFinite(factorMm) || !(factorMm > 0)) {
          next.factor = `${factorLabel} must be a number greater than zero.`;
        } else {
          derivation = { source, factorMm };
        }
      }
    }
    let price: ClassificationValuePrice | null = null;
    if (hasPriceText) {
      const text = priceText.trim();
      const amount = Number(text);
      if (basisLost) {
        next.price = "Choose what the price applies to.";
      } else if (!Number.isFinite(amount) || amount < 0) {
        next.price = "Unit price must be a number, zero or more.";
      } else {
        price = { amount, basis, unit: priceUnit };
      }
      if (needsCurrency && !newCurrency) next.currency = "Choose a currency for the price.";
    }
    if (next.factor || next.price || next.currency) {
      setErrors(next);
      return;
    }
    if (!onSave(derivation, price, needsCurrency ? newCurrency : null)) {
      setSaveError("The quantity could not be saved.");
      return;
    }
    onSaved();
  }

  return (
    <form id={formId} className={styles.form} noValidate onSubmit={submit}>
      <div className={styles.field}>
        <span id={labelId} className={styles.label}>
          Derived quantity
        </span>
        <Select<DerivationChoice>
          id={`${formId}-source`}
          label="Derived quantity"
          labelledBy={labelId}
          value={source}
          options={DERIVATION_OPTIONS.map((option) => ({
            ...option,
            tooltip: DERIVATION_TEXT[option.value],
          }))}
          describedBy={sourceHintId}
          onChange={(next) => edit(() => setSource(next), "factor")}
        />
        <p id={sourceHintId} className={styles.hint}>
          {DERIVATION_TEXT[source]}
        </p>
      </div>
      {source !== "none" && (
        <Input
          ref={factorRef}
          label={`${factorLabel} (${unit})`}
          type="number"
          step="any"
          value={factorText}
          error={errors.factor}
          onChange={(event) => edit(() => setFactorText(event.target.value), "factor")}
        />
      )}
      <Input
        label={shownCurrency ? `Unit price (${shownCurrency})` : "Unit price"}
        type="number"
        step="any"
        value={priceText}
        error={errors.price}
        onChange={(event) => edit(() => setPriceText(event.target.value), "price")}
      />
      <div className={styles.field}>
        <span id={basisLabelId} className={styles.label}>
          Applied to
        </span>
        <Select<PriceBasis | "">
          id={`${formId}-basis`}
          label="Applied to"
          labelledBy={basisLabelId}
          describedBy={basisHintId}
          value={basisLost ? "" : basis}
          options={
            basisLost
              ? [{ value: "", label: "Choose one", disabled: true }, ...basisOptions]
              : basisOptions
          }
          onChange={(next) => next && edit(() => setBasisChoice(next), "price")}
        />
        <p id={basisHintId} className={styles.hint}>
          {basisLost
            ? "The derivation was removed: choose what the price applies to."
            : basis === "derived"
              ? DERIVED_TEXT[derivedKind]
              : BASIS_TEXT[basis]}
        </p>
      </div>
      <div className={styles.field}>
        <span id={unitLabelId} className={styles.label}>
          Unit
        </span>
        <Select<PriceUnit>
          id={`${formId}-unit`}
          label="Unit"
          labelledBy={unitLabelId}
          value={priceUnit}
          options={unitsForBasis.map((value) => ({ value, label: value }))}
          disabled={unitsForBasis.length < 2}
          onChange={(next) => edit(() => setUnitChoice(next), "price")}
        />
      </div>
      {needsCurrency && (
        <CurrencyField
          id={`${formId}-currency`}
          value={newCurrency}
          error={errors.currency}
          onChange={(code) => edit(() => setNewCurrency(code), "currency")}
        />
      )}
      {saveError && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
    </form>
  );
}

export function ClassificationValueRatesDialog({
  valueId,
  dimensionName,
  valueName,
  rates,
  displayUnit,
  currency,
  onSave,
  onClose,
  next,
  onNext,
}: ClassificationValueRatesDialogProps) {
  const formId = useId();
  const factorRef = useRef<HTMLInputElement>(null);
  // Set by "Save and next" just before it submits; any other way to submit clears it.
  const advanceRef = useRef(false);
  const advancedRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  // After advancing, the new form's first field takes focus so the user can keep typing.
  useEffect(() => {
    if (!advancedRef.current) return;
    advancedRef.current = false;
    document.getElementById(`${formId}-source`)?.focus();
  }, [valueId, formId]);

  function saved() {
    if (advanceRef.current && next && onNext) {
      advanceRef.current = false;
      advancedRef.current = true;
      setAnnouncement(next.label);
      onNext();
      return;
    }
    onClose();
  }

  function saveAndNext() {
    advanceRef.current = true;
    (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
  }

  return (
    <Dialog
      open
      size="small"
      title={
        <>
          Quantity and price
          <span className={styles.context}>
            {dimensionName} · {valueName}
          </span>
        </>
      }
      onClose={onClose}
      initialFocus={factorRef}
      actions={
        <>
          <Button variant="ghost" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="compact"
            disabled={!next || !onNext}
            disabledReason="No more values"
            tooltip={next ? `Opens ${next.label}` : undefined}
            onClick={saveAndNext}
          >
            Save and next
          </Button>
          <Button
            size="compact"
            type="submit"
            form={formId}
            onClick={() => {
              advanceRef.current = false;
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <RatesForm
        key={valueId}
        formId={formId}
        factorRef={factorRef}
        rates={rates}
        displayUnit={displayUnit}
        currency={currency}
        onSave={onSave}
        onSaved={saved}
      />
      <span role="status" className={styles.visuallyHidden}>
        {announcement}
      </span>
    </Dialog>
  );
}
