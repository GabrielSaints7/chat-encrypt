// frontend/src/api/api.ts
const API_URL = "http://localhost:3000";

interface MemberKey {
  userId: string;
  encryptedGroupKey: string;
  ephemeralPublicKey: string;
}

interface RotateGroupKeyRequest {
  groupId: string;
  rotatedBy: string;
  newKeyVersion: number;
  memberKeys: MemberKey[];
}

interface RotateGroupKeyResponse {
  success: boolean;
  newKeyVersion: number;
  membersUpdated: number;
}

export const chatApi = {
  /**
   * Rotaciona a chave de um grupo (incrementa keyVersion e atualiza chaves dos membros)
   */
  async rotateGroupKey(
    data: RotateGroupKeyRequest
  ): Promise<RotateGroupKeyResponse> {
    const response = await fetch(`${API_URL}/chat/group/rotate-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Erro ao rotacionar chave do grupo");
    }

    return response.json();
  },

  /**
   * Remove um membro do grupo
   */
  async removeGroupMember(
    groupId: string,
    userId: string,
    removedBy: string
  ): Promise<{
    deleted: boolean;
    shouldRotateKey: boolean;
    currentKeyVersion?: number;
    remainingMembers?: Array<{
      userId: string;
      userName: string;
      publicKey: string;
    }>;
  }> {
    const response = await fetch(
      `${API_URL}/chat/group/${groupId}/member/${userId}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ removedBy }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Erro ao remover membro do grupo");
    }

    return response.json();
  },
};
