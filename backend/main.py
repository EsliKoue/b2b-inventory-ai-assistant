import os
import sqlite3
from datetime import datetime
from typing import List, Optional
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types

# Initialisation de FastAPI
app = FastAPI(title="API Assistant B2B Synchrone")

# Configuration CORS pour autoriser ton frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En production, spécifie l'URL exacte (ex: https://mon-app.vercel.app)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "chat_history.db")

# Init de la base de données SQLite
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # Table des sessions de chat
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            titre TEXT,
            updated_at TEXT
        )
    """)
    # Table des messages
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            role TEXT,
            text TEXT,
            timestamp TEXT,
            FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
    """)
    conn.commit()
    conn.close()

init_db()

# Initialisation du client Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("❌ [LOGS SERVEUR] ALERTE : La variable GEMINI_API_KEY est introuvable dans l'environnement du conteneur !")
    client = None
else:
    print("✅ [LOGS SERVEUR] SUCCÈS : Clé GEMINI_API_KEY détectée avec succès.")
    client = genai.Client(api_key=GEMINI_API_KEY)

# Outil d'interrogation du catalogue Excel
def interroger_catalogue_excel(nom_produit: str) -> str:
    fichier_excel = os.path.join(BASE_DIR, "product_catalog.xlsx")
    if not os.path.exists(fichier_excel):
        return "Erreur : La base de données product_catalog.xlsx est introuvable."
    try:
        df = pd.read_excel(fichier_excel)
        df_clean = df.copy()
        df_clean['Nom Clean'] = df_clean['Nom Produit'].astype(str).str.lower().str.strip()
        
        recherche = nom_produit.lower().strip()
        condition = df_clean['Nom Clean'].str.contains(recherche, na=False)
        resultat = df_clean[condition]
        
        if not resultat.empty:
            reponses = []
            for _, row in resultat.head(3).iterrows():
                prix = f"{row['Prix (FCFA)']:,}".replace(',', ' ')
                reponses.append(f"- {row['Nom Produit']} ({row['Catégorie']}) : {row['Statut']} | Prix : {prix} FCFA | Livraison : {row['Délai de livraison']}")
            return "\n".join(reponses)
        else:
            return f"Aucun équipement correspondant à '{nom_produit}' n'a été trouvé."
    except Exception as e:
        return f"Erreur de lecture du catalogue : {str(e)}"

# Modèles de données Pydantic
class ChatRequest(BaseModel):
    message: str
    session_id: str

class MessageSchema(BaseModel):
    role: str
    text: str

class SessionSchema(BaseModel):
    id: str
    titre: str
    updated_at: str

# --- ROUTES DE L'API ---

@app.get("/api/sessions", response_model=List[SessionSchema])
def get_sessions():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, titre, updated_at FROM sessions ORDER BY updated_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [{"id": r[0], "titre": r[1], "updated_at": r[2]} for r in rows]

@app.get("/api/sessions/{session_id}/messages", response_model=List[MessageSchema])
def get_session_messages(session_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT role, text FROM messages WHERE session_id = ? ORDER BY id ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"role": r[0], "text": r[1]} for r in rows]

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    # Sécurité si la clé API est manquante
    if client is None:
        raise HTTPException(
            status_code=500, 
            detail="Le service Gemini n'est pas initialisé. Vérifiez que la variable GEMINI_API_KEY est correctement configurée dans les Secrets de votre Space Hugging Face."
        )

    now_str = datetime.now().isoformat()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor() # 💡 LA CORRECTION EST ICI : Initialisation du curseur ajoutée !
    
    try:
        # 1. Vérifier ou créer la session
        cursor.execute("SELECT id FROM sessions WHERE id = ?", (req.session_id,))
        if not cursor.fetchone():
            titre = req.message[:30] + "..." if len(req.message) > 30 else req.message
            cursor.execute("INSERT INTO sessions (id, titre, updated_at) VALUES (?, ?, ?)", (req.session_id, titre, now_str))
        else:
            cursor.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now_str, req.session_id))
            
        # 2. Sauvegarder le message utilisateur
        cursor.execute("INSERT INTO messages (session_id, role, text, timestamp) VALUES (?, 'user', ?, ?)", 
                       (req.session_id, req.message, now_str))
        conn.commit()
        
        # 3. Récupérer tout l'historique de cette session pour nourrir Gemini
        cursor.execute("SELECT role, text FROM messages WHERE session_id = ? ORDER BY id ASC", (req.session_id,))
        history_rows = cursor.fetchall()
        
        # On ferme la connexion ici car on a fini les lectures/écritures pour le moment
        conn.close()
        
        # Formater l'historique pour l'API Gemini
        contents_history = []
        for role, text in history_rows:
            contents_history.append(
                types.Content(role=role, parts=[types.Part.from_text(text=text)])
            )
            
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=contents_history,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "Tu es un ingénieur technico-commercial expert en équipements d'infrastructure IT et solutions WASH. "
                    "Tu as accès au catalogue complet de l'entreprise via l'outil 'interroger_catalogue_excel'. "
                    "Tu doit obligatoirement utiliser cet outil pour valider les prix, catégories et stocks.\n\n"
                    "🧠 STRATÉGIE DE RECHERCHE INTELLIGENTE ET AUTONOME :\n"
                    "- Nettoie la saisie utilisateur : extrais les mots-clés au singulier (ex: 'switchs' devient 'switch').\n"
                    "- Si l'outil ne retourne rien pour une recherche précise, élargis immédiatement ta recherche en arrière-plan "
                    "(ex: cherche uniquement la marque comme 'Cisco', ou la catégorie parente comme 'Pompe').\n"
                    "- Rôle de conseiller : Si un produit est en rupture ou introuvable, propose activement une alternative "
                    "proche présente dans le catalogue (ex: un autre modèle de routeur ou une autre station de traitement).\n"
                    "- Si l'utilisateur pose une question sectorielle générale (ex: 'secteur WASH'), et que l'outil ne répond pas "
                    "directement, utilise tes connaissances pour citer des exemples de produits que l'entreprise est susceptible de "
                    "vendre, puis propose de faire une recherche précise pour lui.\n\n"
                    "🚫 CONSIGNES STRICTES DE FORMATAGE (ZÉRO ASTÉRISQUE) :\n"
                    "- Interdiction absolue d'utiliser des astérisques (* ou **) ou des caractères de hachage (#) dans tes réponses.\n"
                    "- Pour mettre en valeur les titres, les noms de produits ou les sections importantes, utilise EXCLUSIVEMENT "
                    "des lettres MAJUSCULES (ex: PRODUIT :, PRIX :, DISPONIBILITÉ :).\n"
                    "- Pour structurer les listes et énumérations, utilise uniquement le tiret simple (-) suivi d'un espace.\n"
                    "- Saute généreusement des lignes entre chaque section pour que la réponse soit aérée, lisible et "
                    "parfaitement adaptée à un affichage professionnel en entreprise."
                ),
                tools=[interroger_catalogue_excel],
                temperature=0.2
            )
        )
        
        ai_text = response.text
        
        # 4. Sauvegarder la réponse de l'IA en base
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO messages (session_id, role, text, timestamp) VALUES (?, 'model', ?, ?)", 
                       (req.session_id, ai_text, now_str))
        conn.commit()
        conn.close()
        
        return {"response": ai_text}
        
    except Exception as e:
        # En cas de crash au milieu, on s'assure de fermer la connexion si elle est restée ouverte
        try:
            conn.close()
        except:
            pass
        raise HTTPException(status_code=500, detail=str(e))
    
# --- ROUTE COMPLÉMENTAIRE : TABLEAU DE BORD ADMIN ---

@app.get("/api/admin/stats")
def get_admin_stats():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 1. Nombre total de sessions (discussions)
        cursor.execute("SELECT COUNT(*) FROM sessions")
        total_sessions = cursor.fetchone()[0]
        
        # 2. Nombre total de messages échangés
        cursor.execute("SELECT COUNT(*) FROM messages")
        total_messages = cursor.fetchone()[0]
        
        # 3. Répartition Utilisateur vs Agent IA
        cursor.execute("SELECT role, COUNT(*) FROM messages GROUP BY role")
        role_rows = cursor.fetchall()
        role_breakdown = {r[0]: r[1] for r in role_rows}
        
        # 4. Volume d'activité journalier (Requêtes journalières - Limité aux 10 derniers jours)
        cursor.execute("""
            SELECT SUBSTR(timestamp, 1, 10) as date_jour, COUNT(*) as qte 
            FROM messages 
            WHERE role = 'user'
            GROUP BY date_jour 
            ORDER BY date_jour DESC 
            LIMIT 10
        """)
        daily_rows = cursor.fetchall()
        daily_stats = [{"date": r[0], "count": r[1]} for r in daily_rows]
        
        conn.close()
        
        return {
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "user_messages_count": role_breakdown.get("user", 0),
            "bot_messages_count": role_breakdown.get("model", 0),
            "daily_stats": daily_stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'extraction des stats : {str(e)}")