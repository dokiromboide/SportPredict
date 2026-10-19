from __future__ import annotations
import sqlite3
from pathlib import Path
import pandas as pd
import plotly.express as px
import streamlit as st
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, log_loss
from sportpredict.model import load_csv, train as train_model, forecast, LABELS
from sportpredict.service import Service

ROOT = Path(__file__).parent
DB_PATH = ROOT / 'sportpredict.db'

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY, user_name TEXT, home_team TEXT, away_team TEXT, prediction TEXT, actual TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)')
    return conn

train = st.cache_data(show_spinner=False)(train_model)

st.set_page_config(page_title='SportPredict',page_icon='⚽',layout='wide')
st.title('⚽ SportPredict'); st.caption('Sistema académico de análisis y predicción de resultados de La Liga')
st.info('Herramienta educativa y experimental. Las probabilidades no garantizan resultados ni deben usarse como asesoría de apuestas.')
with st.sidebar:
    st.header('Datos'); uploaded=st.file_uploader('Importar resultados históricos (CSV)',type=['csv'])
    st.caption('Columnas requeridas: Date, HomeTeam, AwayTeam, FTHG, FTAG. Datos como HS, AS, HST y AST son opcionales.')
    sample=pd.DataFrame([['01/08/2024','Demo FC','Demo Athletic',2,1],['08/08/2024','Demo United','Demo FC',0,2],['15/08/2024','Demo Athletic','Demo United',1,1],['22/08/2024','Demo FC','Demo United',1,0],['29/08/2024','Demo Athletic','Demo FC',0,3],['05/09/2024','Demo United','Demo Athletic',2,0]],columns=['Date','HomeTeam','AwayTeam','FTHG','FTAG'])
    st.download_button('Descargar plantilla CSV',sample.to_csv(index=False).encode('utf-8'),'plantilla_sportpredict.csv','text/csv')
if uploaded:
    try:
        data=load_csv(uploaded.getvalue()); st.success(f'Se cargaron {len(data):,} partidos válidos desde {data.Date.min():%d/%m/%Y}.')
    except Exception as e: st.error(str(e)); st.stop()
else:
    service=Service()
    data=service.frame.drop(columns=['id'])
    st.caption(f'Datos compartidos con la aplicación web: {service.source}.')
page=st.sidebar.radio('Navegación',['Resumen','Partidos','Modelo','Predicción','Retroalimentación','Acerca de'])
if page=='Resumen':
    st.subheader('Resumen de la competición'); c1,c2,c3=st.columns(3)
    c1.metric('Partidos cargados',f'{len(data):,}'); c2.metric('Equipos',data.HomeTeam.nunique()); c3.metric('Periodo',f'{data.Date.min():%Y}–{data.Date.max():%Y}')
    left,right=st.columns(2); d=data.assign(Resultado=data.apply(lambda r:LABELS['H'] if r.FTHG>r.FTAG else LABELS['A'] if r.FTHG<r.FTAG else LABELS['D'],axis=1))
    left.plotly_chart(px.pie(d,names='Resultado',title='Distribución de resultados',hole=.42),use_container_width=True)
    monthly=data.assign(Mes=data.Date.dt.to_period('M').astype(str)).groupby('Mes').size().reset_index(name='Partidos')
    right.plotly_chart(px.bar(monthly,x='Mes',y='Partidos',title='Partidos por mes'),use_container_width=True)
    st.subheader('Marcadores recientes'); st.dataframe(data.sort_values('Date',ascending=False).head(10),use_container_width=True,hide_index=True)
elif page=='Partidos':
    st.subheader('Explorar partidos'); teams=sorted(set(data.HomeTeam)|set(data.AwayTeam)); team=st.selectbox('Filtrar por equipo',['Todos',*teams])
    out=data if team=='Todos' else data[(data.HomeTeam==team)|(data.AwayTeam==team)]
    st.dataframe(out.sort_values('Date',ascending=False),use_container_width=True,hide_index=True)
    st.download_button('Exportar resultados filtrados',out.to_csv(index=False).encode('utf-8'),'partidos_sportpredict.csv','text/csv')
elif page=='Modelo':
    st.subheader('Entrenamiento y evaluación temporal'); st.write('Forma de los cinco partidos anteriores, diferencia de goles y equipos. El tramo más reciente (20 % de las fechas) se reserva para prueba.')
    if len(data)<30 or data.HomeTeam.str.startswith('Demo ').all(): st.warning('Carga al menos 30 partidos reales para ver métricas representativas.')
    else:
        try:
            model,feat,test,pred=train(data); acc=accuracy_score(test.target,pred); c1,c2,c3=st.columns(3)
            c1.metric('Exactitud temporal',f'{acc:.1%}'); c2.metric('Partidos de prueba',len(test)); probs=model.predict_proba(test[['HomeTeam','AwayTeam','home_form','away_form','home_goal_diff','away_goal_diff']])
            c3.metric('Log loss',f'{log_loss(test.target,probs,labels=model.classes_):.3f}')
            st.caption('La exactitud observada no garantiza resultados futuros. El 80 % del acta es una meta, no un resultado asumido.')
            st.plotly_chart(px.imshow(confusion_matrix(test.target,pred,labels=['H','D','A']),x=['Local','Empate','Visitante'],y=['Local','Empate','Visitante'],text_auto=True,title='Matriz de confusión'),use_container_width=True)
            st.code(classification_report(test.target,pred,labels=['H','D','A'],target_names=['Local','Empate','Visitante'],zero_division=0))
        except Exception as e: st.error(f'No fue posible entrenar el modelo: {e}')
elif page=='Predicción':
    st.subheader('Estimación para un partido')
    if data.HomeTeam.str.startswith('Demo ').all() or len(data)<30: st.warning('Importa al menos 30 partidos históricos reales antes de generar predicciones.')
    else:
        teams=sorted(set(data.HomeTeam)|set(data.AwayTeam)); col1,col2=st.columns(2)
        home=col1.selectbox('Equipo local',teams); away=col2.selectbox('Equipo visitante',[t for t in teams if t!=home])
        if st.button('Calcular probabilidades',type='primary'):
            probabilities=forecast(data,home,away); values={LABELS[c]:p for c,p in probabilities.items()}
            st.plotly_chart(px.bar(x=list(values.values()),y=list(values.keys()),orientation='h',range_x=[0,1],labels={'x':'Probabilidad','y':'Resultado'},title=f'{home} vs {away}'),use_container_width=True)
            st.caption('Estimación estadística basada en el historial cargado; no incluye lesiones, alineaciones ni contexto actual.')
elif page=='Retroalimentación':
    st.subheader('Registro de retroalimentación'); st.write('Guarda el resultado real para evaluación con usuarios. Estos registros no alteran automáticamente el modelo.')
    with st.form('feedback'):
        name=st.text_input('Usuario o código (opcional)'); home=st.text_input('Equipo local'); away=st.text_input('Equipo visitante')
        predicted=st.selectbox('Resultado predicho',list(LABELS.values())); actual=st.selectbox('Resultado real',list(LABELS.values())); notes=st.text_area('Observaciones'); submitted=st.form_submit_button('Guardar evaluación')
    if submitted:
        with db() as conn: conn.execute('INSERT INTO feedback(user_name,home_team,away_team,prediction,actual,notes) VALUES(?,?,?,?,?,?)',(name,home,away,predicted,actual,notes))
        st.success('Evaluación guardada localmente en SQLite.')
    with db() as conn: saved=pd.read_sql_query('SELECT created_at,user_name,home_team,away_team,prediction,actual,notes FROM feedback ORDER BY id DESC',conn)
    st.dataframe(saved,use_container_width=True,hide_index=True)
else:
    st.subheader('Acerca de SportPredict')
    st.markdown('**Propósito:** análisis académico de resultados de fútbol con datos, modelos predictivos y visualizaciones.\n\n**Tecnologías:** Python, Streamlit, pandas, scikit-learn, Plotly y SQLite.\n\n**Datos:** importa archivos CSV públicos y conserva la atribución y condiciones de uso de su proveedor. Fuente sugerida: [Football-Data.co.uk](https://football-data.co.uk/spainm.php).\n\n**Limitaciones:** el modelo no alcanza automáticamente la meta del 80 %. La retroalimentación se guarda para análisis posterior y no activa reentrenamiento automático.')
    st.code('Date,HomeTeam,AwayTeam,FTHG,FTAG\n31/08/2024,Barcelona,Real Valladolid,7,0',language='csv')
