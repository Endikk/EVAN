using System.Threading.Channels;
using EVAN.Application.Abstractions;
using EVAN.Application.Observabilite;
using EVAN.Core.Domain.Alarms;
using Microsoft.Extensions.Logging;

namespace EVAN.Application.Live;

/// <summary>
/// File d'écriture unique vers la base pour les alarmes, le journal et les états machine. Un seul consommateur écrit dans
/// l'ordre d'arrivée : une alarme levée puis close ne peut plus finir « active ». Base injoignable, l'écriture attend et
/// réessaie (attente progressive) ; refusée plusieurs fois par le serveur, elle est écartée et journalisée pour ne pas
/// bloquer les suivantes. Les écritures en attente et perdues sont mesurées (evan.base.file et evan.base.perdues, file
/// « journal »).
/// </summary>
internal sealed class StoreWriter : IAsyncDisposable
{
    private const int Capacite = 50_000;
    private const int RejetsMax = 5;
    private static readonly TimeSpan AttenteMax = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan VidageMax = TimeSpan.FromSeconds(5);

    private sealed record Ecriture(string Objet, Func<IStore, CancellationToken, Task> Executer);

    private readonly IStore _store;
    private readonly ILogger _log;
    private readonly TimeSpan _premierEssai;
    private readonly Channel<Ecriture> _file;
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _consommateur;
    private long _perdues;
    /// <summary>Écritures entrées et pas encore sorties (écrites, perdues ou écartées), celle en cours comprise.</summary>
    private long _enAttente;

    public StoreWriter(IStore store, ILogger log, TimeSpan premierEssai)
    {
        _store = store;
        _log = log;
        _premierEssai = premierEssai;
        // Bornée pour une très longue panne de base : au-delà, les plus anciennes écritures sont perdues, et comptées.
        _file = Channel.CreateBounded<Ecriture>(new BoundedChannelOptions(Capacite) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true }, e =>
        {
            Sortie();
            Metriques.Perdues(Metriques.FileJournal, "file_pleine");
            if (Interlocked.Increment(ref _perdues) % 1000 == 1) _log.LogError("File d'écriture pleine : {Count} écritures perdues (dont {Objet})", Interlocked.Read(ref _perdues), e.Objet);
        });
        _consommateur = Task.Run(() => ConsommerAsync(_cts.Token));
    }

    public void Alarm(string siteId, Alarme alarm) => Ajouter($"alarme {alarm.Id} ({alarm.Statut})", (s, ct) => s.SaveAlarmAsync(siteId, alarm, ct));

    public void Event(string siteId, Evenement e) => Ajouter($"événement {e.Id}", (s, ct) => s.SaveEventAsync(siteId, e, ct));

    public void MachineState(string machineId, string etat, double vitesse, DateTimeOffset t) =>
        Ajouter($"état {etat} de {machineId}", (s, ct) => s.SaveMachineStateAsync(machineId, etat, vitesse, t, ct));

    private void Ajouter(string objet, Func<IStore, CancellationToken, Task> executer)
    {
        // Comptée avant d'entrer : le consommateur peut la sortir avant même le retour de TryWrite.
        Interlocked.Increment(ref _enAttente);
        Metriques.EnFile(Metriques.FileJournal, 1);
        if (_file.Writer.TryWrite(new Ecriture(objet, executer))) return;
        Sortie();
        _log.LogWarning("Écriture de {Objet} ignorée : arrêt en cours", objet);
    }

    private void Sortie()
    {
        Interlocked.Decrement(ref _enAttente);
        Metriques.EnFile(Metriques.FileJournal, -1);
    }

    private async Task ConsommerAsync(CancellationToken ct)
    {
        try
        {
            await foreach (var e in _file.Reader.ReadAllAsync(ct))
            {
                await EcrireAsync(e, ct);
                Sortie();
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            // arrêt : le délai de vidage est écoulé
        }
    }

    private async Task EcrireAsync(Ecriture e, CancellationToken ct)
    {
        var attente = _premierEssai;
        for (var rejets = 0; ;)
        {
            try
            {
                await e.Executer(_store, ct);
                return;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                if (_store.IsPermanentFailure(ex) && ++rejets >= RejetsMax)
                {
                    _log.LogError(ex, "Écriture de {Objet} refusée {Rejets} fois par la base : écartée", e.Objet, rejets);
                    Metriques.Perdues(Metriques.FileJournal, "refus");
                    return;
                }
                _log.LogWarning("Écriture de {Objet} en échec ({Message}), nouvel essai dans {Attente} s", e.Objet, ex.Message, attente.TotalSeconds);
                await Task.Delay(attente, ct);
                attente = TimeSpan.FromTicks(Math.Min(attente.Ticks * 2, AttenteMax.Ticks));
            }
        }
    }

    /// <summary>Arrêt : la file est fermée puis vidée, 5 s au plus, avant d'annuler ce qui reste.</summary>
    public async ValueTask DisposeAsync()
    {
        _file.Writer.TryComplete();
        if (await Task.WhenAny(_consommateur, Task.Delay(VidageMax)) != _consommateur)
            _log.LogWarning("Arrêt : {Count} écritures en base abandonnées après {Delai} s", _file.Reader.Count, VidageMax.TotalSeconds);
        await _cts.CancelAsync();
        await _consommateur;
        _cts.Dispose();
        // Ce qui reste (vidage interrompu) ne sera jamais écrit : la file de cette instance repart de zéro.
        Metriques.EnFile(Metriques.FileJournal, -Interlocked.Exchange(ref _enAttente, 0));
    }
}
