// frontend/src/components/GroupChat.tsx

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { CryptoService } from "../services/crypto.service";
import socketService from "../services/socket.service";
import { chatApi } from "../api/api";

interface GroupChatProps {
  group: any;
  onBack: () => void;
}

interface GroupMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: Date;
  decrypted: boolean;
}

export function GroupChat({ group, onBack }: GroupChatProps) {
  const { user, privateKey } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [groupKey, setGroupKey] = useState<CryptoKey | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar chave do grupo e mensagens
  useEffect(() => {
    loadGroupKeyAndMessages();
  }, [group.id]);

  // Listener para mensagens novas de grupo
  useEffect(() => {
    console.log("[GROUP-CHAT] Registrando listener de mensagens para grupo:", group.id);

    const socket = socketService.getSocket();
    if (!socket) {
      console.error("[GROUP-CHAT] Socket não está conectado!");
      return;
    }

    const handleGroupMessage = async (data: any) => {
      console.log("📨 [GROUP-CHAT] Evento group:message:receive recebido:", data);
      if (data.groupId !== group.id) {
        console.log("⏭️ [GROUP-CHAT] Mensagem de outro grupo, ignorando");
        return;
      }

      console.log(" [GROUP-CHAT] Mensagem é do grupo atual, descriptografando...");

      // Aguardar a chave do grupo se ainda não estiver disponível
      let currentGroupKey = groupKey;
      if (!currentGroupKey) {
        console.log("[GROUP-CHAT] Chave do grupo não disponível ainda, buscando do localStorage...");
        try {
          const groupKeys = JSON.parse(localStorage.getItem("groupKeys") || "{}");
          const groupKeyB64 = groupKeys[group.id];
          if (groupKeyB64) {
            const groupKeyRaw = CryptoService.base64ToArrayBuffer(groupKeyB64);
            currentGroupKey = await CryptoService.importGroupKey(groupKeyRaw);
            console.log("[GROUP-CHAT] Chave do grupo recuperada do localStorage");
          } else {
            console.error("[GROUP-CHAT] Chave do grupo não encontrada no localStorage");
            return;
          }
        } catch (error) {
          console.error("[GROUP-CHAT] Erro ao recuperar chave do grupo:", error);
          return;
        }
      }

      try {
        const decryptedText = await CryptoService.decryptGroupMessage(
          data.encryptedData,
          data.nonce,
          currentGroupKey
        );

        const message: GroupMessage = {
          id: data.id,
          senderId: data.senderId,
          senderName: data.senderName,
          text: decryptedText,
          createdAt: new Date(data.createdAt),
          decrypted: true,
        };

        setMessages((prev) => {
          const exists = prev.some((m) => m.id === message.id);
          if (exists) {
            console.log("[GROUP-CHAT] Mensagem já existe, ignorando duplicata");
            return prev;
          }
          console.log("[GROUP-CHAT] Adicionando nova mensagem:", message.id);
          return [...prev, message];
        });
      } catch (error) {
        console.error("[GROUP-CHAT] Erro ao descriptografar mensagem:", error);
      }
    };

    const unsubscribeGroupMsg = socketService.onGroupMessage(handleGroupMessage);

    // Listener para confirmação de envio
    const handleSent = (data: any) => {
      console.log(" [GROUP-CHAT] Confirmação de envio recebida:", data);
    };

    // Listener para erro de envio
    const handleError = (data: any) => {
      console.error("[GROUP-CHAT] Erro ao enviar mensagem:", data);
      alert("Erro ao enviar mensagem: " + data.message);
    };

    // Listener para Geração de chave do grupo
    const handleKeyRotated = async (data: {
      groupId: string;
      newKeyVersion: number;
    }) => {
      if (data.groupId !== group.id) return;

      console.log("\n NOTIFICAÇÃO: Chave rotacionada remotamente");

      // Obter fingerprint da chave antiga
      let oldKeyFingerprint = "N/A";
      if (groupKey) {
        oldKeyFingerprint = await CryptoService.getKeyFingerprint(groupKey);
      }

      try {
        // Recarregar informações do grupo para obter a nova chave cifrada
        const response = await fetch(
          `http://localhost:3000/chat/group/${group.id}`
        );
        const updatedGroup = await response.json();

        // Encontrar minha entrada de membro
        const myMembership = updatedGroup.members.find(
          (m: any) => m.userId === user!.id
        );

        if (!myMembership) {
          console.error("Não encontrado como membro após Geração");
          return;
        }

        // Decifrar nova chave
        const newGroupKeyRaw = await CryptoService.decryptGroupKey(
          myMembership.encryptedGroupKey,
          myMembership.ephemeralPublicKey,
          privateKey!
        );

        const newGroupKey = await CryptoService.importGroupKey(newGroupKeyRaw);
        const newKeyFingerprint = await CryptoService.getKeyFingerprint(newGroupKeyRaw);

        // Atualizar estado
        setGroupKey(newGroupKey);

        // Atualizar localStorage
        const groupKeyB64 = CryptoService.arrayBufferToBase64(newGroupKeyRaw);
        const groupKeys = JSON.parse(localStorage.getItem("groupKeys") || "{}");
        groupKeys[group.id] = groupKeyB64;
        localStorage.setItem("groupKeys", JSON.stringify(groupKeys));

        console.log(" COMPARAÇÃO:");
        console.log("   Chave ANTIGA:", oldKeyFingerprint);
        console.log("   Chave NOVA:  ", newKeyFingerprint);
        console.log(" Chave atualizada localmente!\n");

        alert(
          `A chave do grupo foi rotacionada (nova versão: ${data.newKeyVersion}). Suas mensagens continuarão funcionando normalmente.`
        );
      } catch (error) {
        console.error("Erro ao atualizar chave:", error);
        alert(
          "Erro ao atualizar chave do grupo. Por favor, saia e entre novamente no grupo."
        );
      }
    };

    socket.on("group:message:sent", handleSent);
    socket.on("group:message:error", handleError);
    socket.on("group:key:rotated", handleKeyRotated);

    return () => {
      console.log("[GROUP-CHAT] Removendo listeners de mensagens");
      unsubscribeGroupMsg();
      socket.off("group:message:sent", handleSent);
      socket.off("group:message:error", handleError);
      socket.off("group:key:rotated", handleKeyRotated);
    };
  }, [group.id]); // Removido groupKey das dependências

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadGroupKeyAndMessages = async () => {
    try {
      console.log("[GROUP-CHAT] Carregando chave do grupo...");

      // 1. Decifrar chave do grupo
      const groupKeyRaw = await CryptoService.decryptGroupKey(
        group.myEncryptedGroupKey,
        group.myEphemeralPublicKey,
        privateKey!
      );

      const gKey = await CryptoService.importGroupKey(groupKeyRaw);
      setGroupKey(gKey);

      // Salvar no localStorage para uso posterior
      const groupKeyB64 = CryptoService.arrayBufferToBase64(groupKeyRaw);
      const groupKeys = JSON.parse(localStorage.getItem("groupKeys") || "{}");
      groupKeys[group.id] = groupKeyB64;
      localStorage.setItem("groupKeys", JSON.stringify(groupKeys));

      console.log("[GROUP-CHAT] Chave do grupo carregada");

      // 2. Carregar mensagens
      console.log(" [GROUP-CHAT] Carregando mensagens...");
      const response = await fetch(
        `http://localhost:3000/chat/group/${group.id}/messages?userId=${
          user!.id
        }`
      );

      if (!response.ok) {
        throw new Error("Erro ao carregar mensagens");
      }

      const data = await response.json();
      console.log(` [GROUP-CHAT] ${data.length} mensagens encontradas`);

      // 3. Descriptografar mensagens
      const decryptedMessages: GroupMessage[] = [];

      for (const msg of data) {
        try {
          const decryptedText = await CryptoService.decryptGroupMessage(
            msg.encryptedData,
            msg.nonce,
            gKey
          );

          decryptedMessages.push({
            id: msg.id,
            senderId: msg.senderId,
            senderName: msg.sender.name,
            text: decryptedText,
            createdAt: new Date(msg.createdAt),
            decrypted: true,
          });
        } catch (error) {
          console.error("[GROUP-CHAT] Erro ao descriptografar:", msg.id);
          decryptedMessages.push({
            id: msg.id,
            senderId: msg.senderId,
            senderName: msg.sender.name,
            text: "[Erro ao descriptografar]",
            createdAt: new Date(msg.createdAt),
            decrypted: false,
          });
        }
      }

      setMessages(decryptedMessages);
      console.log("[GROUP-CHAT] Mensagens carregadas");
    } catch (error: any) {
      console.error("[GROUP-CHAT] Erro:", error);
      alert("Erro ao carregar grupo: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageInput.trim() || !groupKey) return;

    setSending(true);

    try {
      console.log("[GROUP-CHAT] Enviando mensagem...");

      // Cifrar mensagem
      const { encryptedData, nonce } = await CryptoService.encryptGroupMessage(
        messageInput,
        groupKey
      );

      // Enviar via WebSocket
      console.log("[GROUP-CHAT] Emitindo evento group:message:send...");
      const socket = socketService.getSocket();

      if (!socket || !socket.connected) {
        throw new Error("WebSocket não está conectado");
      }

      socket.emit("group:message:send", {
        groupId: group.id,
        senderId: user!.id,
        encryptedData,
        nonce,
        keyVersion: group.myKeyVersion || 1,
      });

      console.log("[GROUP-CHAT] Evento emitido, aguardando confirmação...");

      // Limpar input imediatamente para melhor UX
      setMessageInput("");

      // A mensagem será adicionada quando receber o evento group:message:receive
      // Isso garante sincronização e previne duplicatas
    } catch (error) {
      console.error("[GROUP-CHAT] Erro ao enviar:", error);
      alert("Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const handleAddMember = async () => {
    try {
      if (!newMemberEmail.trim()) return;

      console.log("[GROUP-CHAT] Adicionando membro:", newMemberEmail);

      // 1. Buscar usuário
      const userResponse = await fetch(
        `http://localhost:3000/auth/user/email/${newMemberEmail}`
      );

      if (!userResponse.ok) {
        throw new Error("Usuário não encontrado");
      }

      const newMember = await userResponse.json();

      // 2. Cifrar chave do grupo para o novo membro
      const groupKeyRaw = CryptoService.base64ToArrayBuffer(
        JSON.parse(localStorage.getItem("groupKeys") || "{}")[group.id]
      );

      const memberPublicKeyRaw = CryptoService.base64ToArrayBuffer(
        newMember.publicKey
      );
      const { encryptedGroupKey, ephemeralPublicKey } =
        await CryptoService.encryptGroupKeyForMember(
          groupKeyRaw,
          memberPublicKeyRaw
        );

      // 3. Adicionar no servidor
      const response = await fetch("http://localhost:3000/chat/group/member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: group.id,
          userId: newMember.id,
          encryptedGroupKey,
          ephemeralPublicKey,
          addedBy: user!.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      alert(`${newMember.name} adicionado ao grupo!`);
      setNewMemberEmail("");
      setShowAddMember(false);
    } catch (error: any) {
      console.error("[GROUP-CHAT] Erro:", error);
      alert("Erro: " + error.message);
    }
  };

  /**
   * Rotaciona a chave do grupo após remover um membro
   * Gera nova chave AES, cifra para cada membro restante e atualiza no servidor
   */
  const rotateGroupKey = async (
    groupId: string,
    remainingMembers: Array<{ userId: string; userName: string; publicKey: string }>,
    currentKeyVersion: number
  ) => {
    try {
      console.log("\n Geração DE CHAVE - Iniciada");

      // Obter fingerprint da chave antiga
      let oldKeyFingerprint = "N/A";
      if (groupKey) {
        oldKeyFingerprint = await CryptoService.getKeyFingerprint(groupKey);
      }

      // 1. Gerar nova chave de grupo
      const newGroupKey = await CryptoService.generateGroupKey();
      const newGroupKeyRaw = await CryptoService.exportGroupKey(newGroupKey);
      const newKeyVersion = currentKeyVersion + 1;

      // Obter fingerprint da nova chave
      const newKeyFingerprint = await CryptoService.getKeyFingerprint(newGroupKeyRaw);

      console.log(" COMPARAÇÃO:");
      console.log("   Chave ANTIGA:", oldKeyFingerprint);
      console.log("   Chave NOVA:  ", newKeyFingerprint);
      console.log("   Versão:", currentKeyVersion, "→", newKeyVersion);

      // 2. Cifrar a nova chave para cada membro restante
      const memberKeys = [];
      for (const member of remainingMembers) {
        const memberPublicKeyRaw = CryptoService.base64ToArrayBuffer(
          member.publicKey
        );

        const { encryptedGroupKey, ephemeralPublicKey } =
          await CryptoService.encryptGroupKeyForMember(
            newGroupKeyRaw,
            memberPublicKeyRaw
          );

        memberKeys.push({
          userId: member.userId,
          encryptedGroupKey,
          ephemeralPublicKey,
        });
      }

      // 3. Enviar para o servidor
      await chatApi.rotateGroupKey({
        groupId,
        rotatedBy: user!.id,
        newKeyVersion,
        memberKeys,
      });

      // 4. Atualizar chave local
      const groupKeyB64 = CryptoService.arrayBufferToBase64(newGroupKeyRaw);
      const groupKeys = JSON.parse(localStorage.getItem("groupKeys") || "{}");
      groupKeys[groupId] = groupKeyB64;
      localStorage.setItem("groupKeys", JSON.stringify(groupKeys));

      // 5. Atualizar estado local
      setGroupKey(newGroupKey);

      console.log(" Geração concluída!\n");

      return true;
    } catch (error: any) {
      console.error("Erro ao rotacionar chave:", error);
      throw error;
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm("Deseja realmente sair do grupo?")) return;

    try {
      const response = await fetch(
        `http://localhost:3000/chat/group/${group.id}/member/${user!.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removedBy: user!.id }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      alert("Você saiu do grupo");
      onBack();
    } catch (error: any) {
      alert("Erro: " + error.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (
      !confirm(
        "Deseja realmente DELETAR o grupo? Esta ação não pode ser desfeita!"
      )
    )
      return;

    try {
      const response = await fetch(
        `http://localhost:3000/chat/group/${group.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user!.id }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      alert("Grupo deletado");
      onBack();
    } catch (error: any) {
      alert("Erro: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Carregando grupo...</div>
      </div>
    );
  }

  const isAdmin = group.creatorId === user!.id;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Voltar
          </button>
          <div>
            <h2 className="font-semibold text-lg">{group.name}</h2>
            <p className="text-sm text-gray-500">
              {group._count.members} membros
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowMembers(!showMembers)}
            className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
          >
            Membros
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
              >
                Adicionar
              </button>
              <button
                onClick={handleDeleteGroup}
                className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Deletar
              </button>
            </>
          )}

          {!isAdmin && (
            <button
              onClick={handleLeaveGroup}
              className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
            >
              🚪 Sair
            </button>
          )}
        </div>
      </div>

      {/* Modal Adicionar Membro */}
      {showAddMember && (
        <div className="bg-blue-50 border-b px-4 py-3">
          <div className="flex gap-2">
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="Email do novo membro"
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={handleAddMember}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Adicionar
            </button>
            <button
              onClick={() => setShowAddMember(false)}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Membros */}
      {showMembers && (
        <div className="bg-gray-50 border-b px-4 py-3">
          <h3 className="font-semibold mb-2">Membros do Grupo:</h3>
          <div className="space-y-1">
            {group.members?.map((member: any) => (
              <div
                key={member.id}
                className="flex items-center justify-between"
              >
                <span className="text-sm">
                  {member.user.name} {member.role === "admin" && "👑"}
                  {member.userId === user!.id && " (você)"}
                </span>
                {isAdmin && member.userId !== user!.id && (
                  <button
                    onClick={async () => {
                      if (confirm(`Remover ${member.user.name}?`)) {
                        try {
                          console.log(
                            "[GROUP-CHAT] Removendo membro:",
                            member.user.name
                          );

                          // 1. Remover membro via API
                          const result = await chatApi.removeGroupMember(
                            group.id,
                            member.userId,
                            user!.id
                          );

                          console.log(
                            "[GROUP-CHAT] Membro removido:",
                            result
                          );

                          // 2. Se necessário, rotacionar a chave
                          if (
                            result.shouldRotateKey &&
                            result.remainingMembers
                          ) {
                            console.log(
                              "[GROUP-CHAT] Rotacionando chave do grupo..."
                            );

                            await rotateGroupKey(
                              group.id,
                              result.remainingMembers,
                              result.currentKeyVersion!
                            );

                            alert(
                              `${member.user.name} removido e chave do grupo rotacionada!`
                            );
                          } else if (result.deleted) {
                            alert("Grupo deletado (sem membros restantes)");
                            onBack();
                            return;
                          } else {
                            alert(`${member.user.name} removido!`);
                          }

                          // 3. Recarregar página para atualizar lista de membros
                          window.location.reload();
                        } catch (error: any) {
                          console.error(
                            "[GROUP-CHAT] Erro ao remover membro:",
                            error
                          );
                          alert("Erro ao remover membro: " + error.message);
                        }
                      }
                    }}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((msg) => {
          const isMe = msg.senderId === user!.id;

          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-4 py-2 ${
                  isMe
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-gray-200"
                }`}
              >
                {!isMe && (
                  <div className="text-xs font-semibold mb-1 text-gray-600">
                    {msg.senderName}
                  </div>
                )}
                <div className={msg.decrypted ? "" : "text-red-500 italic"}>
                  {msg.text}
                </div>
                <div
                  className={`text-xs mt-1 ${
                    isMe ? "text-blue-100" : "text-gray-500"
                  }`}
                >
                  {msg.createdAt.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="bg-white border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={sending}
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
            disabled={sending || !messageInput.trim()}
          >
            {sending ? "..." : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}

