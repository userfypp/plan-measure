// The "konva" entry bundles every shape and filter. vite.config.ts aliases it to this module, which
// registers only the nodes Plan Measure renders through react-konva (Stage, Layer, Group and Shape
// are part of the core). Register a new node here before using it.
import Konva from "konva/lib/Core";
import "konva/lib/shapes/Circle";
import "konva/lib/shapes/Label";
import "konva/lib/shapes/Line";
import "konva/lib/shapes/Rect";
import "konva/lib/shapes/Text";

export default Konva;
