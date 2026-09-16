import { AnchoredMenu, Button } from "../components/ui";
import type { MeasurementDecimalPlaces } from "../types/domain";
import { useTheme, type ThemePreference } from "./themeState";
import styles from "./AppBar.module.css";

const FEEDBACK_URL = "https://github.com/userfypp/plan-measure/discussions/1";

interface AppBarProps {
  documentName: string | null;
  canExport: boolean;
  measurementDecimalPlaces?: MeasurementDecimalPlaces | null;
  confirmMeasurementDeletion?: boolean;
  onOpenPdf: () => void;
  onExport: () => void;
  onMeasurementDecimalPlacesChange?: (decimalPlaces: MeasurementDecimalPlaces) => void;
  onConfirmMeasurementDeletionChange?: (enabled: boolean) => void;
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="2.4" />
      <path d="M10 2.8v1.5M10 15.7v1.5M17.2 10h-1.5M4.3 10H2.8M15.1 4.9l-1.05 1.05M5.95 14.05 4.9 15.1M15.1 15.1l-1.05-1.05M5.95 5.95 4.9 4.9" />
      <circle cx="10" cy="10" r="5.7" />
    </svg>
  );
}

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const MEASUREMENT_DECIMAL_OPTIONS: MeasurementDecimalPlaces[] = [0, 1, 2, 3, 4, 5, 6];

export function AppBar({
  documentName,
  canExport,
  measurementDecimalPlaces = null,
  confirmMeasurementDeletion = true,
  onOpenPdf,
  onExport,
  onMeasurementDecimalPlacesChange,
  onConfirmMeasurementDeletionChange,
}: AppBarProps) {
  const { preference, setPreference } = useTheme();
  const themeItems = THEME_OPTIONS.map((option, index) => ({
    id: option.id,
    label: option.label,
    sectionLabel: index === 0 ? "Appearance" : undefined,
    role: "menuitemradio" as const,
    checked: preference === option.id,
    onSelect: () => setPreference(option.id),
  }));
  const measurementDecimalItems =
    measurementDecimalPlaces === null || !onMeasurementDecimalPlacesChange
      ? []
      : MEASUREMENT_DECIMAL_OPTIONS.map((decimalPlaces, index) => ({
          id: `measurement-decimals-${decimalPlaces}`,
          label: `${decimalPlaces} decimal${decimalPlaces === 1 ? "" : "s"}`,
          sectionLabel: index === 0 ? "Measurement decimals" : undefined,
          role: "menuitemradio" as const,
          checked: measurementDecimalPlaces === decimalPlaces,
          onSelect: () => onMeasurementDecimalPlacesChange(decimalPlaces),
        }));
  const deletionItems = onConfirmMeasurementDeletionChange
    ? [
        {
          id: "confirm-measurement-deletion",
          label: "Confirm before deleting measurements",
          sectionLabel: "Measurement deletion",
          role: "menuitemcheckbox" as const,
          checked: confirmMeasurementDeletion,
          onSelect: () => onConfirmMeasurementDeletionChange(!confirmMeasurementDeletion),
        },
      ]
    : [];

  return (
    <header className={styles.appBar} aria-label="Application bar">
      <div className={styles.identityGroup}>
        <div className={styles.brand}>Plan Measure</div>
        <span className={styles.identityDivider} aria-hidden="true" />
        <div className={styles.documentName} title={documentName ?? undefined}>
          {documentName ?? "No PDF loaded"}
        </div>
      </div>

      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="compact"
          className={styles.openAction}
          onClick={onOpenPdf}
        >
          Open PDF
        </Button>
        {canExport && (
          <Button
            variant="ghost"
            size="compact"
            className={styles.exportAction}
            onClick={onExport}
          >
            Export
          </Button>
        )}
        <a
          className={styles.feedbackAction}
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Feedback
        </a>
        <AnchoredMenu
          trigger={<SettingsIcon />}
          triggerProps={{
            className: styles.iconTrigger,
            "aria-label": "Settings",
            title: "Settings",
          }}
          label="Settings"
          items={[...themeItems, ...measurementDecimalItems, ...deletionItems]}
          className={styles.settingsMenu}
          placement="bottom-end"
        />
      </div>
    </header>
  );
}
