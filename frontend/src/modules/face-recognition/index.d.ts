import { ComponentType } from "react";
import type { Agent } from "../../types";

export interface ModalEnrollAgentProps {
  agent: Agent;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ModalEnrollAgent: ComponentType<ModalEnrollAgentProps>;
export const FaceEnrollComponent: ComponentType<any>;
export const FaceCheckInPage: ComponentType<any>;
export const faceApi: any;
