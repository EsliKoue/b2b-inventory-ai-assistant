import os
import pandas as pd
import streamlit as st
from google import genai
from google.genai import types
from google.genai.errors import ServerError

# 1. Configuration de la page Web Streamlit
st.set_page_config(
    page_title="Agent d'Inventaire B2B",
    page_icon="📦",
    layout="centered"
)

st.title("📦 Assistant d'Inventaire B2B")
st.write("Posez vos questions sur la disponibilité, les prix et les délais de livraison des équipements.")

# 2. Initialisation du client Gemini (Mise en cache pour éviter les reconnexions)
@st.cache_resource
def initialiser_client():
    # Récupère automatiquement la variable $env:GEMINI_API_KEY du terminal
    return genai.Client()

try:
    client = initialiser_client()
except Exception as e:
    st.error("Erreur de configuration de la clé API. Assurez-vous d'avoir défini $env:GEMINI_API_KEY")

# 3. L'Outil local connecté au fichier Excel
def verifier_stock_et_prix(nom_produit: str) -> str:
    """
    Vérifie la disponibilité, le prix et le délai de livraison d'un produit spécifique 
    dans le catalogue d'inventaire Excel de l'entreprise.
    """
    fichier_excel = "product_catalog.xlsx"
    if not os.path.exists(fichier_excel):
        return "Erreur technique : Le catalogue Excel 'product_catalog.xlsx' est introuvable."
    
    try:
        df = pd.read_excel(fichier_excel)
        df_clean = df.copy()
        df_clean['Nom Produit Clean'] = df_clean['Nom Produit'].astype(str).str.lower().str.strip()
        produit_recherche = nom_produit.lower().strip()
        
        resultat = df_clean[df_clean['Nom Produit Clean'] == produit_recherche]
        
        if not resultat.empty:
            row = resultat.iloc[0]
            # Formatage propre sans virgules pour les normes locales
            prix_formate = f"{row['Prix (FCFA)']:,}".replace(',', ' ')
            return f"Produit: {row['Nom Produit']} | Statut: {row['Statut']} | Prix: {prix_formate} FCFA | Délai: {row['Délai de livraison']}"
        else:
            return f"Le produit '{nom_produit}' n'est pas répertorié dans le fichier Excel."
    except Exception as e:
        return f"Erreur lors de la lecture du fichier Excel : {str(e)}"

# 4. Gestion de l'historique de discussion (Session State)
if "messages" not in st.session_state:
    st.session_state.messages = []

# Affichage des anciens messages de la session
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

# 5. Zone de saisie utilisateur (Interface Chat)
if prompt := st.chat_input("Ex: Quel est le prix du Switch Catalyst 9300 ?"):
    
    # Afficher le message de l'utilisateur
    with st.chat_message("user"):
        st.markdown(prompt)
    st.session_state.messages.append({"role": "user", "content": prompt})

    # Génération de la réponse de l'agent
    with st.chat_message("assistant"):
        with st.spinner("L'agent analyse le catalogue Excel..."):
            try:
                reponse = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=(
                            "Tu es un agent d'automatisation d'inventaire B2B de haut niveau. "
                            "Tu as un accès direct au catalogue via l'outil 'verifier_stock_et_prix'. "
                            "Lorsqu'un client demande un tarif ou une disponibilité, utilise TOUJOURS l'outil. "
                            "Réponds poliment, de manière concise et professionnelle en français."
                        ),
                        tools=[verifier_stock_et_prix],
                        temperature=0.15
                    )
                )
                
                # Affichage du résultat final
                st.markdown(reponse.text)
                st.session_state.messages.append({"role": "assistant", "content": reponse.text})
                
            except ServerError:
                # Interception propre de la surutilisation des serveurs Google (Erreur 503)
                st.error("⚠️ Les serveurs de Google subissent une forte demande actuellement. Veuillez cliquer à nouveau sur Entrée pour renvoyer la demande.")
            except Exception as e:
                st.error(f"Une erreur inattendue est survenue : {str(e)}")