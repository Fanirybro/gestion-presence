import { ComponentType } from "react";

export interface FaceEnrollComponentProps {
  targetPersonnelId?: string | number | null;
  isModal?: boolean;
  onSuccess?: (agent?: any) => void;
  onClose?: () => void;
}

declare const FaceEnrollComponent: ComponentType<FaceEnrollComponentProps>;
export default FaceEnrollComponent;

