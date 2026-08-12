import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  Calibration,
  DrawingDraft,
  LinearUnit,
  PageState,
  PdfMetadata,
  Point,
  SessionSettings,
  SessionV1,
  Tool,
} from "../types/domain";
import { isValidCalibration } from "../utils/geometry";

export interface AppState {
  session: SessionV1 | null;
  tool: Tool;
  selectedMeasurementId: string | null;
  draft: DrawingDraft | null;
  error: string | null;
}

export type AppAction =
  | { type: "LOAD_SESSION"; session: SessionV1 }
  | { type: "CLEAR_SESSION" }
  | { type: "SET_PAGE"; pageNumber: number }
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_DRAFT"; draft: DrawingDraft | null }
  | { type: "UPDATE_DRAFT_POINTER"; draftType: DrawingDraft["type"]; pointer: Point }
  | { type: "SET_CALIBRATION"; pageNumber: number; calibration: Calibration }
  | { type: "ADD_LINE"; pageNumber: number; id: string; points: [Point, Point] }
  | { type: "ADD_POLYGON"; pageNumber: number; id: string; points: Point[] }
  | { type: "SELECT_MEASUREMENT"; id: string | null }
  | { type: "UPDATE_MEASUREMENT_POINTS"; pageNumber: number; id: string; points: Point[] }
  | { type: "RENAME_MEASUREMENT"; pageNumber: number; id: string; name: string }
  | { type: "DELETE_MEASUREMENT"; pageNumber: number; id: string }
  | { type: "SET_SETTING"; setting: "displayUnit"; value: LinearUnit }
  | {
      type: "SET_SETTING";
      setting: "showLabels" | "showMeasurements" | "showCalibration";
      value: boolean;
    }
  | { type: "SET_ERROR"; message: string | null };

export const initialAppState: AppState = {
  session: null,
  tool: "select",
  selectedMeasurementId: null,
  draft: null,
  error: null,
};

function createPageState(pageNumber: number): PageState {
  return {
    pageNumber,
    calibration: null,
    measurements: [],
    nextLineNumber: 1,
    nextPolygonNumber: 1,
  };
}

export function createEmptySession(
  pdf: PdfMetadata,
  pageCount: number,
  settings?: Partial<SessionSettings>,
): SessionV1 {
  const pages: Record<number, PageState> = {};
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pages[pageNumber] = createPageState(pageNumber);
  }
  return {
    schemaVersion: 1,
    pdf,
    pageCount,
    currentPage: 1,
    pages,
    settings: {
      displayUnit: "m",
      showLabels: true,
      showMeasurements: true,
      showCalibration: true,
      ...settings,
    },
  };
}

function updatePage(
  session: SessionV1,
  pageNumber: number,
  updater: (page: PageState) => PageState,
): SessionV1 {
  const page = session.pages[pageNumber];
  if (!page) return session;
  return {
    ...session,
    pages: {
      ...session.pages,
      [pageNumber]: updater(page),
    },
  };
}

function pageIsCalibrated(session: SessionV1 | null, pageNumber?: number): boolean {
  if (!session) return false;
  return Boolean(session.pages[pageNumber ?? session.currentPage]?.calibration);
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "LOAD_SESSION":
      return {
        ...initialAppState,
        session: action.session,
      };
    case "CLEAR_SESSION":
      return initialAppState;
    case "SET_PAGE": {
      if (!state.session) return state;
      const pageNumber = Math.min(state.session.pageCount, Math.max(1, action.pageNumber));
      return {
        ...state,
        session: { ...state.session, currentPage: pageNumber },
        tool: "select",
        selectedMeasurementId: null,
        draft: null,
        error: null,
      };
    }
    case "SET_TOOL": {
      if (
        (action.tool === "line" || action.tool === "polygon") &&
        !pageIsCalibrated(state.session)
      ) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: "Calibrate this page before creating measurements.",
        };
      }
      return {
        ...state,
        tool: action.tool,
        draft: null,
        error: null,
      };
    }
    case "SET_DRAFT":
      return { ...state, draft: action.draft };
    case "UPDATE_DRAFT_POINTER":
      if (!state.draft || state.draft.type !== action.draftType) return state;
      return { ...state, draft: { ...state.draft, pointer: action.pointer } };
    case "SET_CALIBRATION": {
      if (!state.session) return state;
      if (!isValidCalibration(action.calibration)) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: "Calibration requires two distinct points and a valid distance greater than zero.",
        };
      }
      return {
        ...state,
        session: updatePage(state.session, action.pageNumber, (page) => ({
          ...page,
          calibration: action.calibration,
        })),
        tool: "select",
        draft: null,
        error: null,
      };
    }
    case "ADD_LINE": {
      if (!state.session || !pageIsCalibrated(state.session, action.pageNumber)) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: "Calibrate this page before creating measurements.",
        };
      }
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        nextLineNumber: page.nextLineNumber + 1,
        measurements: [
          ...page.measurements,
          {
            id: action.id,
            type: "line" as const,
            name: `Line ${page.nextLineNumber}`,
            points: action.points,
          },
        ],
      }));
      return {
        ...state,
        session,
        tool: "select",
        draft: null,
        selectedMeasurementId: action.id,
        error: null,
      };
    }
    case "ADD_POLYGON": {
      if (!state.session || !pageIsCalibrated(state.session, action.pageNumber)) {
        return {
          ...state,
          tool: "select",
          draft: null,
          error: "Calibrate this page before creating measurements.",
        };
      }
      if (action.points.length < 3) {
        return { ...state, error: "A polygon requires at least three vertices." };
      }
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        nextPolygonNumber: page.nextPolygonNumber + 1,
        measurements: [
          ...page.measurements,
          {
            id: action.id,
            type: "polygon" as const,
            name: `Polygon ${page.nextPolygonNumber}`,
            points: action.points,
          },
        ],
      }));
      return {
        ...state,
        session,
        tool: "select",
        draft: null,
        selectedMeasurementId: action.id,
        error: null,
      };
    }
    case "SELECT_MEASUREMENT":
      return { ...state, selectedMeasurementId: action.id, error: null };
    case "UPDATE_MEASUREMENT_POINTS": {
      if (!state.session) return state;
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) => {
          if (measurement.id !== action.id) return measurement;
          if (measurement.type === "line") {
            if (action.points.length !== 2) return measurement;
            return { ...measurement, points: [action.points[0]!, action.points[1]!] };
          }
          if (action.points.length < 3) return measurement;
          return { ...measurement, points: action.points };
        }),
      }));
      return { ...state, session };
    }
    case "RENAME_MEASUREMENT": {
      if (!state.session) return state;
      const name = action.name.trim();
      if (!name) {
        return { ...state, error: "Measurement name cannot be empty." };
      }
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.map((measurement) =>
          measurement.id === action.id ? { ...measurement, name } : measurement,
        ),
      }));
      return { ...state, session, error: null };
    }
    case "DELETE_MEASUREMENT": {
      if (!state.session) return state;
      const session = updatePage(state.session, action.pageNumber, (page) => ({
        ...page,
        measurements: page.measurements.filter((measurement) => measurement.id !== action.id),
      }));
      return {
        ...state,
        session,
        selectedMeasurementId:
          state.selectedMeasurementId === action.id ? null : state.selectedMeasurementId,
        error: null,
      };
    }
    case "SET_SETTING": {
      if (!state.session) return state;
      return {
        ...state,
        session: {
          ...state.session,
          settings: {
            ...state.session.settings,
            [action.setting]: action.value,
          },
        },
        error: null,
      };
    }
    case "SET_ERROR":
      return { ...state, error: action.message };
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppState must be used inside AppProvider.");
  return context;
}
